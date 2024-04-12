import { Pool } from "pg";
import dotenv from "dotenv";
import amqp from "amqplib";

import logger from "./logger";

//--[ types ]------------------------------------------------------------------

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

//--[ ENV ]--------------------------------------------------------------------

dotenv.config();

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
    logger.error(
        `.env file is missing the following keys: ${requiredKeys.join(", ")}`
    );
    
    process.exit(1);
};

//--[ DATABASE ]---------------------------------------------------------------

const pool = new Pool({
    user: env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    host: env.DATABASE_HOST,
    database: env.DATABASE_NAME
});

//--[ FUNCTIONS ]--------------------------------------------------------------

async function appendNewWord(
    userId: number,
    word: string,
    translation: string,
    words: List[] 
) {
    words.push({ key: word, value: translation });

    const json_data = JSON.stringify(words);

    try {
        await pool.query("INSERT INTO words(userId, list) VALUES($1, $2) ON CONFLICT (userId) DO UPDATE SET list = EXCLUDED.list;", [userId, json_data]);
        return { message: "OK", error: false };
    } catch(err) {
        return { message: `appendNewWord(): Error occurred for user '${userId}': '${(err as Error).message}'`, error: true };
    }
}

async function startBot(userId: number) {
    let userData: DatabaseUserRes;

    try {
        const res = await pool.query("SELECT * FROM users INNER JOIN flags on users.userid = flags.userid INNER JOIN words on users.userid = words.userid WHERE users.userid = $1", [userId]);
        
        if (!res.rows[0])
            return { message: `startBot(): Error occurred for user '${userId}': Cannot find user`, error: true };
        
        userData = res.rows[0] as DatabaseUserRes;
    } catch(err) {
        return { message: `startBot(): Error occurred for user '${userId}': '${(err as Error).message}'`, error: true };
    }

    // logger.log(JSON.stringify(userData));

    return { message: "OK", error: false };
}

async function worker() {
    let channel;

    try {
        const connection = await amqp.connect(`amqp://${env.RABBITMQ_USERNAME}:${env.RABBITMQ_PASSWORD}@${env.RABBITMQ_HOST}`);
        channel = await connection.createChannel();
    } catch(err) {
        return logger.error(`worker(): Cannot connect to RabbitMQ server: ${(err as Error).message}`);    
    }

    const queue = "botqueue";
    channel.assertQueue(queue, { durable: true });
    channel.prefetch(2);

    logger.log(`worker(): Waiting for tasks on channel: '${queue}'`);
    
    channel.consume(queue, async msg => {
        if (msg == null)
                return logger.warn("worker(): Received null message");
        
        const userId = parseInt(msg.content.toString());

        logger.log(`worker(): Received a task, starting bot for user: '${userId}'`);
    
        await startBot(userId);
    });
}

worker();
