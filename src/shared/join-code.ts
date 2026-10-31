export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;

export function normalizeJoinCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function formatJoinCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
