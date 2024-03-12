import { devices, chromium, Browser, BrowserContext } from "playwright";
import { Pool } from "pg";
import amqp from "amqplib";
import dotenv from "dotenv";

import logger from "./logger";
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

//--[ TYPES ]-------------------------------------------------------------------

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

//--[ ENV ]---------------------------------------------------------------------

const env = process.env as {
    DATABASE_USERNAME: string,
    DATABASE_PASSWORD: string,
    DATABASE_HOST:     string,
    DATABASE_NAME:     string,
    INSTALING_KEY:     string,
    RABBITMQ_USERNAME: string,
    RABBITMQ_PASSWORD: string,
    RABBITMQ_HOST:     string
};

const envKeys = Object.keys(env);
let requiredKeys = [
    "DATABASE_USERNAME",
    "DATABASE_PASSWORD",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "INSTALING_KEY",
    "RABBITMQ_HOST",
    "RABBITMQ_USERNAME",
    "RABBITMQ_PASSWORD"
].filter(key => !envKeys.includes(key));

if (requiredKeys.length > 0) {
    logger.error(`.env file is missing the following keys: ${requiredKeys.join(", ")}`);
    process.exit(1);
};

//--[ FUNCTIONS ]---------------------------------------------------------------

const xorEncryption = (text: string, key: string) => {
    let encryptedText = "";

    for (let i = 0; i < text.length; i++) {
        encryptedText += String.fromCharCode(
            text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
    }

    return encryptedText;
};

const sleep = async(timeout: number) => {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve(true);
        }, timeout);
    });
};

const random = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min) + min);
};

const replaceDomElement = (text: string) => {
    const replaceWith = { " ": " ", "&nbsp;": " ", "&amp;": '&', "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'"};

    Object.keys(replaceWith).map(key => {
        // @ts-ignore
        text = text.replace(new RegExp(key, "g"), replaceWith[key]);
    });

    return text;
}

//--[ BOT ]---------------------------------------------------------------------

const pool = new Pool({
    user:     env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    host:     env.DATABASE_HOST,
    database: env.DATABASE_NAME
});

async function startBot(userId: number, context: BrowserContext): Promise<[number, Error[]]> {
    // --[ DATABASE LOGIC ]-----------------------------------------------------

    let res;

    try {
        res = await pool.query("SELECT * FROM users INNER JOIN flags on users.userid = flags.userid INNER JOIN words on users.userid = words.userid WHERE users.userid = $1", [userId]);
    } catch(err) {
        return [1002, [err as Error]];
    }

    logger.log(`startBot(): SQL query executed for user ${userId}`);

    const userData: DatabaseUserRes | undefined = res.rows[0];

    if (userData === undefined)
        return [1000, []];

    const password = xorEncryption(userData.instaling_pass, env.INSTALING_KEY);

    // --[ LOGIN LOGIC ]--------------------------------------------------------

    const page = await context.newPage();

    try {
        await page.goto("https://instaling.pl/teacher.php?page=login");
    } catch(err) {
        await page.close();
        return [1001, [err as Error]];
    }

    await page.waitForLoadState("domcontentloaded");

    await page.locator("xpath=/html/body/div[2]/div[2]/div[1]/div[2]/div[2]/button[1]")
        .click()
        .catch(() => logger.warn(`startBot(): Cannot find cookie button for session ${userId}`));

    await sleep(random(300, 1000));

    try {
        await page.locator('//*[@id="log_email"]').pressSequentially(userData.instaling_user, { delay: random(250, 500) });
        await sleep(random(500, 1000));
        await page.locator('//*[@id="log_password"]').pressSequentially(password, { delay: random(230, 600) });
        await sleep(random(500, 1500));
        await page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click();
    } catch(err) {
        await page.close();
        return [1003, [err as Error]];
    }

    await page.waitForLoadState("domcontentloaded");

    if (!page.url().startsWith("https://instaling.pl/student/pages/mainPage.php")) {
        await page.close();
        return [1004, []]
    }

    // --[ SESSION LOGIC ]------------------------------------------------------

    logger.log(`startBot(): Logged in as ${userData.instaling_user} (${userId})`);

    await sleep(random(600, 1200));

    try {
        await page.locator('//*[@id="student_panel"]/p[1]/a').click();
    } catch(err) {
        logger.warn(`startBot(): Primary student panel method failed, using backup: ${(err as Error).message}`);

        const r = await page.getByRole("link")
            .filter({ hasText: /Dokończ sesję|Zacznij codzienną sesję/ })
            .click()
            .catch(async err => {
                await page.close();
                return err as Error;
            });

        if (r)
            return [1005, [r]];
    }

    await page.waitForLoadState("domcontentloaded");

    await sleep(random(500, 2000));

    logger.log(`startBot(): Started session for user ${userData.instaling_user} (${userId})`);

    try {
        await page.locator('//*[@id="start_session_button"]').click();
    } catch(errP) {
        const r = await page.locator('//*[@id="continue_session_button"]')
            .click()
            .catch(async err => {
                await page.close();
                return [err as Error, errP as Error];
            });

        if (r)
            return [1006, r];
    }

    await page.waitForLoadState("domcontentloaded");

    const truthTable: {
        [key: string]: string | string[]
    } = {};

    userData.list.forEach((x) => {
        if (truthTable[x.key]) {
            const value = truthTable[x.key];
            if (typeof(value) == "string")
                truthTable[x.key] = [value, x.value];
            else if (typeof(value) == "object")
                // @ts-ignore
                truthTable[x.key].push(x.value); 
        } else truthTable[x.key] = x.value
    });
    
    let iterations = 0;

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
                return [1, []];
            }
        } catch(err) {
            logger.error(`startBot(): Cannot handle "Czy znasz już to słówko?": ${(err as Error).message}`)
        }

        let word = await page.locator('//*[@id="question"]/div[2]/div[2]').innerHTML();

        word = replaceDomElement(word.trim());

        let translation = truthTable[word.trim()];

        if (typeof(translation) == "object")
            translation = translation[Math.floor(Math.random() * translation.length)];

        if (translation === undefined) {
            await page.locator('//*[@id="check"]').click();

            await sleep(500);
            await page.waitForLoadState("domcontentloaded");

            let newTranslation = await page.locator('xpath=/html/body/div/div[9]/div[1]/div[2]').innerHTML();
            newTranslation = replaceDomElement(newTranslation.trim());
            logger.log(`startBot(): Found word outside of list: "${newTranslation}"`);
            truthTable[word.trim()] = newTranslation.trim();

            try {
                await page.locator('//*[@id="next_word"]', { hasText: "Następne" }).click();
            } catch(err) {
                logger.error(`startBot(): Cannot press "next_word" for session ${userId}`);
                break;
            }

            continue;
        }

        if (!translation) {
            iterations++;
            if (iterations >= 5) {
                logger.warn(`startBot(): Couldn't find translation for "${word}" for session ${userId}`);
                break;
            }
            continue;
        }

        try {
            await page.locator('//*[@id="answer"]').pressSequentially(translation, { timeout: 120000, delay: random(230, 800) });
            await sleep(random(500, 1000));
            await page.locator('//*[@id="check"]').click();
        } catch(err) {
            logger.error(`startBot(): Couldn't fill or skip word "${translation} (${word})" for session ${userId}`);
            continue;
        }

        await sleep(random(500, 2000));
        await page.waitForLoadState("domcontentloaded");

        try {
            await page.locator('//*[@id="next_word"]', { hasText: "Następne" }).click();
        } catch(err) {
            logger.error(`startBot(): Cannot press "next_word" for session ${userId}`);
            break;
        }
    }

    await page.close();

    return [1009, []];
}

async function worker() {
    let browser: Browser;

    try {
        browser = await chromium.launch({
            headless: true,
            args: ["--mute-audio"]
        });
    } catch(err) {
        return logger.error(`worker(): Cannot spawn browser: ${(err as Error).message}`);
    }

    if (!browser) {
        return logger.error("worker(): Cannot spawn main browser");
    }

    try {
        const connection = await amqp.connect(`amqp://${env.RABBITMQ_USERNAME}:${env.RABBITMQ_PASSWORD}@${env.RABBITMQ_HOST}`);
        const channel = await connection.createChannel();
        
        const queue = "botqueue";
        channel.assertQueue(queue, { exclusive: true, durable: true });

        channel.prefetch(1);
        logger.log(`worker(): Waiting for tasks on channel ${queue}`);

        channel.consume(queue, async msg => {
            if (msg == null) return logger.warn("Received null message");
        
            const msgContent = msg.content.toString();
            const userId = parseInt(msgContent);
        
            logger.log(`worker(): Received a task, starting bot for user ${userId}`);
        
            const context = await browser.newContext({
                ...devices["Desktop Chrome"],
            });
        
            context.setDefaultTimeout(60000);
        
            const [res, err] = await startBot(userId, context);
        
            context.close();

            switch (res) {
                case 1:
                    logger.log(`worker(): Finished bot for user ${userId}`);
                    break;
                case 1000:
                    logger.warn(`worker(): User with id ${userId} doesn't exist or didn't scrape words yet`);
                    break;
                case 1001:
                    logger.error(`worker(): Cannot enter instaling.pl for user ${userId} due to: ${(err[0] as Error).message}`);
                    break;
                case 1002:
                    logger.error(`worker(): Cannot query database for user ${userId} due to: ${(err[0] as Error).message}`);
                    break;
                case 1003:
                    logger.error(`worker(): Cannot login for user ${userId} due to: ${(err[0] as Error).message}`);
                    break;
                case 1004:
                    logger.error(`worker(): Invalid login credentials for user ${userId}`);
                    break;
                case 1005:
                    logger.error(`worker(): Primary and backup student panel methods failed for user: ${userId}, due to: ${(err[0] as Error).message}`);
                    break;
                case 1006:
                    logger.error(`worker(): Cannot start session for user ${userId}: ${(err[0] as Error).message}\n====SECOND====\n${(err[1] as Error).message}`);
                    break;
                default:
                    logger.error(`worker(): Unknown error for user ${userId}`);
                    break;
            }
            
            channel.sendToQueue(msg.properties.replyTo, Buffer.from(res.toString()),{
                correlationId: msg.properties.correlationId
            });

            channel.ack(msg);
        });

    } catch (error) {
        logger.error("worker(): Global error: ", error);
    }
}

worker();