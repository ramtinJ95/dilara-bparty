export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const clockTime = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
