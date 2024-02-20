export async function sleep(timeout: number) {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve(true);
        }, timeout);
    });
};

export function random(min: number, max: number) {
    return Math.random() * (max - min) + min;
};

export function randomF(min: number, max: number) {
    return Math.floor(random(min, max));
};