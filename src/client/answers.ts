export const LETTERS = "ABCD";

export const formatSv = (n: number) => n.toLocaleString("sv-SE");

// Accepts a Swedish decimal comma and thousands spaces; an empty field is not zero.
export const parseNumber = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/\s/gu, "").replace(",", ".")));
