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
}

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
        res = await client.query("SELECT * FROM users, words, flags WHERE users.userid = $1", [userId]);
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
            headless: false
        });
    } catch(err) {
        return logger.error(`startBot(): Cannot spawn browser: ${(err as Error).message}`)
    }

    const context = await browser.newContext({
        ...devices["Desktop Chrome"]
    });
    const page = await context.newPage();

    await page.goto("https://instaling.pl/teacher.php?page=login");

    await page.waitForLoadState("domcontentloaded");

    await page.locator("xpath=/html/body/div[2]/div[2]/div[1]/div[2]/div[2]/button[1]")
        .click({ timeout: 5000 })
        .catch(() => logger.warn(`startBot(): Cannot find cookie button for session ${userId}`));

    try {
        await page.locator('//*[@id="log_email"]').fill(userData.instaling_user);
        await page.locator('//*[@id="log_password"]').fill(password);
        await page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click({ timeout: 2000 });
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

    try {
        await page.locator('//*[@id="student_panel"]/p[1]/a').click({ timeout: 2000 });
    } catch(err) {
        logger.warn(`startBot(): Primary student panel method failed, using backup: ${(err as Error).message}`);

        const r = await page.getByRole("link")
            .filter({ hasText: /Dokończ sesję|Zacznij codzienną sesję/ })
            .click({ timeout: 2000 })
            .catch(async err => {
                await context.close();
                await browser.close();
                return logger.error(`startBot(): Backup student panel failed: ${(err as Error).message}`);
            });

        if (r === false)
            return;
    }

    await page.waitForLoadState("domcontentloaded");

    try {
        await page.locator('//*[@id="start_sesion_button"]').click({ timeout: 2000 })
    } catch(errP) {
        const r = await page.locator('//*[@id="continue_session_button"]')
            .click({ timeout: 2000 })
            .catch(async err => {
                await context.close();
                await browser.close();
                return logger.error(`startBot(): Cannot start session for user ${userId}: ${(err as Error).message}\n====SECOND====\n${(errP as Error).message}`);
            });
        if (r === false)
            return;
    }

    // await context.close();
    // await browser.close();
}

for(let i = 1; i <= 3; i++) {
    startBot(i);
}
