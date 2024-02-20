import { devices, chromium, Browser } from "playwright";
import { Pool } from "pg";
import dotenv from "dotenv";
import logger from "./logger";
import { DBUser, User } from "./database/user";
import { createClient } from "redis";

const MAX_QUEUE_LENGTH = 5;

dotenv.config();

const env = process.env;
const envKeys = Object.keys(env);
let requiredKeys = ["DATABASE_USERNAME", "DATABASE_PASSWORD", "DATABASE_HOST", "DATABASE_NAME", "INSTALING_KEY", "REDIS_PASSWORD", "REDIS_HOST", "REDIS_PORT"].filter(key => !envKeys.includes(key));

if (requiredKeys.length > 0) {
    logger.error(`.env file is missing the following keys: ${requiredKeys.join(", ")}`);
    process.exit(1);
}

const pool = new Pool({
    user: env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    host: env.DATABASE_HOST,
    database: env.DATABASE_NAME
});

const redis = createClient({
    password: env.REDIS_PASSWORD,
    socket: {
        host: env.REDIS_HOST,
        // @ts-ignore
        port: parseInt(env.REDIS_PORT)
    }
});

let queue: User[] = [];

async function getQueue() {
    while (queue.length < MAX_QUEUE_LENGTH) {
        const { element } = await redis.brPop("bot_queue", 0) || { element: null };

        if (!element) {
            continue;
        }

        const [type, id] = element.split("-");
        // const user = await DBUser.get(pool, elem);

        switch(type) {
            case "start":
                
            break;
    }
}

async function main() {
    redis.connect();

    setTimeout(() => {
        getQueue();
    }, 2000);

    console.log(queue);
}

main();