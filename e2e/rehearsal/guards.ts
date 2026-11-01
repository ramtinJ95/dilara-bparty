import type { AdminState } from "../../src/shared/protocol";

// Staging and production share the Cloudflare account's free daily Durable Object allowance, and it resets at 00:00 UTC.
export const PARTY_DAY_UTC = "2026-11-07";

function isLocal(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(host);
  } catch {
    return false;
  }
}

export function partyDayRefusal(baseUrl: string, now: Date, force: boolean): string | null {
  if (force || now.toISOString().slice(0, 10) !== PARTY_DAY_UTC || isLocal(baseUrl)) return null;
  return `Refusing to rehearse against ${baseUrl} on the party day, ${PARTY_DAY_UTC} (UTC). Every deployed Worker, staging and production, draws on the account's daily Durable Object allowance. Pass --force only if you are sure.`;
}

const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

export function existingContent({ quiz, landingPhoto, contest }: AdminState): string[] {
  const photos = contest.entrants.reduce((n, e) => n + e.versions.length, 0);
  return [
    quiz.questions.length ? counted(quiz.questions.length, "quiz question") : null,
    landingPhoto ? "a landing photo" : null,
    photos ? counted(photos, "contest photo") : null,
  ].filter((found) => found !== null);
}

export function contentRefusal(baseUrl: string, found: string[], force: boolean): string | null {
  if (force || !found.length) return null;
  return `Refusing to rehearse against ${baseUrl}: it holds ${found.join(", ")}. The rehearsal ends by wiping the party, which deletes all of it. Pass --force only if it is disposable.`;
}
