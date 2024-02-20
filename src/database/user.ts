import { random } from "../utils";

function xorEncryption(text: string, key: string): string {
    let encryptedText = "";

    for (let i = 0; i < text.length; i++) {
        encryptedText += String.fromCharCode(
            text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
    }

    return encryptedText;
};

export interface List {
    key:   string;
    value: string;
};

export interface DBUser {
    userid:         number;
    username:       string;
    list:           List[];
    todo:           boolean;
    hoursrange:     `[${number}, ${number}]`;
    instaling_user: string;
    instaling_pass: string;
    error_level:    number;
};

export class User {
    readonly userid: number;
    readonly username: string;
    readonly list: List[];
    readonly todo: boolean;
    readonly hoursrange: `[${number}, ${number}]`;
    readonly instaling_user: string;
    readonly instaling_pass: string;
    readonly error_level: number;
    readonly randomTime: number;

    constructor(data: DBUser) {
        this.userid = data.userid;
        this.username = data.username;
        this.list = data.list;
        this.todo = data.todo;
        this.hoursrange = data.hoursrange;
        this.instaling_user = data.instaling_user;
        this.instaling_pass = data.instaling_pass;
        this.error_level = data.error_level;
        this.randomTime = this.getRandomTime();
    }

    getPassword(): string {
        // env.INSTALING_KEY is checked in src/index.ts
        // @ts-expect-error
        return xorEncryption(this.instaling_pass, process.env.INSTALING_KEY);
    }

    getUser(): string {
        return this.instaling_user;
    }

    getRandomTime(): number {
        const [min, max] = JSON.parse(this.hoursrange);
        const hour = random(min, max);

        const unixTime = hour;

        return unixTime;
    }

    errorRandomizer(): boolean {
        return Math.floor(Math.random() * 100) < this.error_level;
    }

    timeToRun(): boolean {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        return (currentHour + currentMinute / 60) >= this.randomTime;
    }
}