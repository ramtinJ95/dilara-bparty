// A copy of the signed pid cookie, so a phone whose Safari lost the cookie gets back in without the join code.
// It holds the player's id and signature only, never the join secret.
const KEY = "pid";

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function rememberSession(pid: string): void {
  try {
    storage()?.setItem(KEY, pid);
  } catch {}
}

export function forgetSession(): void {
  storage()?.removeItem(KEY);
}

export const hasSession = () => !!storage()?.getItem(KEY);

export type Restore = "restored" | "refused" | "unreached";

// The pages wait for this before they show anything, so a stalled line gives up and shows them.
const RESTORE_WITHIN_MS = 8_000;

// A refused copy is forgotten. One that didn't reach the server is kept for the next try.
export async function restoreSession(): Promise<Restore> {
  const pid = storage()?.getItem(KEY);
  if (!pid) return "refused";
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RESTORE_WITHIN_MS);
  try {
    const res = await fetch("/api/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid }),
      signal: abort.signal,
    });
    if (res.ok) return "restored";
    if (res.status !== 403) return "unreached";
    forgetSession();
    return "refused";
  } catch {
    return "unreached";
  } finally {
    clearTimeout(timer);
  }
}
