import { devices, chromium, Browser } from "playwright";
import { Pool } from "pg";
import dotenv from "dotenv";

import logger from "./logger";

dotenv.config();

export interface DatabaseUserRes {
    userid:         number;
    email:          string;
    username:       string;
    password:       string;
    created:        Date;
    list:           List[];
    todo:           boolean;
    hoursrange:     `[${number}, ${number}]`;
    instaling_user: string;
    instaling_pass: string;
    error_level:    number;
};

export interface List {
    key:   string;
    value: string;
};

const pool = new Pool({
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME
});

function xorEncryption(text: string, key: string): string {
    let encryptedText = "";

    for (let i = 0; i < text.length; i++) {
        encryptedText += String.fromCharCode(
            text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
    }

    return encryptedText;
};

async function sleep(timeout: number) {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve(true);
        }, timeout);
    });
};

function random(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
};

async function startBot(userId: number) {
    if (!process.env.INSTALING_KEY)
        return logger.error(`startBot(): Master key not set, killing`);

    // --[ DATABASE LOGIC ]-----------------------------------------------------

    let client;

    try {
        client = await pool.connect()
    } catch(err) {
        return logger.error(`startBot(): Cannot connect to database: ${(err as Error).message}`)
    }

    let res;

    try {
        res = await client.query("SELECT * FROM users INNER JOIN flags on users.userid = flags.userid INNER JOIN words on users.userid = words.userid WHERE users.userid = $1", [userId]);
    } catch(err) {
        return logger.error(`startBot(): Cannot query database: ${(err as Error).message}`);
    }

    const userData: DatabaseUserRes | undefined = res.rows[0];

    if (userData === undefined)
        return logger.warn(`startBot(): User with id ${userId} doesn't exist or didn't scrape words yet`);

    const password = xorEncryption(userData.instaling_pass, process.env.INSTALING_KEY);

    // --[ LOGIN LOGIC ]--------------------------------------------------------

    let browser: Browser;

    try {
        browser = await chromium.launch({
            headless: false,
            args: ["--mute-audio"]
        });
    } catch(err) {
        return logger.error(`startBot(): Cannot spawn browser: ${(err as Error).message}`);
    }

    const context = await browser.newContext({
        ...devices["Desktop Chrome"],
    });

    context.setDefaultTimeout(2000);

    const page = await context.newPage();

    await page.goto("https://instaling.pl/teacher.php?page=login");

    await page.waitForLoadState("domcontentloaded");

    await sleep(random(300, 1000));

    await page.locator("xpath=/html/body/div[2]/div[2]/div[1]/div[2]/div[2]/button[1]")
        .click()
        .catch(() => logger.warn(`startBot(): Cannot find cookie button for session ${userId}`));

    await sleep(random(300, 1000));

    try {
        await page.locator('//*[@id="log_email"]').pressSequentially(userData.instaling_user, { timeout: 20000, delay: random(250, 500) });
        await sleep(random(500, 1000));
        await page.locator('//*[@id="log_password"]').pressSequentially(password, { timeout: 20000, delay: random(230, 600) });
        await sleep(random(500, 1500));
        await page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click();
    } catch(err) {
        await context.close();
        await browser.close();
        return logger.error(`startBot(): Cannot login: ${(err as Error).message}`);
    }

    await page.waitForLoadState("domcontentloaded");

    if (!page.url().startsWith("https://instaling.pl/student/pages/mainPage.php")) {
        await context.close();
        await browser.close();
        return logger.log(`startBot(): Invalid login credentials for session ${userId}`);
    }

    // --[ SESSION LOGIC ]------------------------------------------------------

    await sleep(random(600, 1200));

    try {
        await page.locator('//*[@id="student_panel"]/p[1]/a').click();
    } catch(err) {
        logger.warn(`startBot(): Primary student panel method failed, using backup: ${(err as Error).message}`);

        const r = await page.getByRole("link")
            .filter({ hasText: /Dokończ sesję|Zacznij codzienną sesję/ })
            .click()
            .catch(async err => {
                await context.close();
                await browser.close();
                return logger.error(`startBot(): Backup student panel failed: ${(err as Error).message}`);
            });

        if (r === false)
            return;
    }

    await page.waitForLoadState("domcontentloaded");

    await sleep(random(500, 2000));

    try {
        await page.locator('//*[@id="start_session_button"]').click();
    } catch(errP) {
        const r = await page.locator('//*[@id="continue_session_button"]')
            .click()
            .catch(async err => {
                await context.close();
                await browser.close();
                return logger.error(`startBot(): Cannot start session for user ${userId}: ${(err as Error).message}\n====SECOND====\n${(errP as Error).message}`);
            });
        if (r === false)
            return;
    }

    await page.waitForLoadState("domcontentloaded");

    const truthTable: {
        [key: string]: string
    } = {};

    userData.list.forEach((x) => (truthTable[x.key] = x.value));

    while (true) {
        await sleep(random(500, 1000));
        await page.waitForLoadState("domcontentloaded");

        try {
            const isNew = await page.locator("xpath=/html/body/div/div[8]/div[3]/div[1]").isVisible();
            if (isNew) {
                await page.locator('//*[@id="dont_know_new"]').click();
                continue;
            }

            const possibleWord = await page.locator('//*[@id="possible_word_page"]').isVisible();
            if (possibleWord) {
                await page.locator('//*[@id="skip"]').click();
                continue;
            }

            const finishPage = await page.locator('//*[@id="finish_page"]').isVisible();
            if (finishPage) {
                logger.log(`startBot(): Finished session ${userId}`);
                break;
            }
        } catch(err) {
            logger.error(`startBot(): Cannot handle "Czy znasz już to słówko?": ${(err as Error).message}`)
        }

        const word = await page.locator('//*[@id="question"]/div[2]/div[2]').innerHTML();
        const translation = truthTable[word];

        if (!translation)
            break;

        try {
            await page.locator('//*[@id="answer"]').pressSequentially(translation, { timeout: 60000, delay: random(230, 400) });
            await page.locator('//*[@id="check"]').click();
        } catch(err) {
            logger.error(`startBot(): Couldn't fill or skip word "${translation} (${word})" for session ${userId}`);
            continue;
        }

        await sleep(random(500, 1000));
        await page.waitForLoadState("domcontentloaded");

        try {
            await page.locator('//*[@id="next_word"]', { hasText: "Następne" }).click();
        } catch(err) {
            logger.error(`startBot(): Cannot press "next_word" for session ${userId}`);
            break;
        }
    }

    await context.close();
    await browser.close();
}

for(let i = 1; i <= 3; i++) {
    startBot(i);
}
