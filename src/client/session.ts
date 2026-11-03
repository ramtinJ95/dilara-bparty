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

// A refused copy is forgotten. One that failed to reach the server is kept for the next load.
export async function restoreSession(): Promise<boolean> {
  const pid = storage()?.getItem(KEY);
  if (!pid) return false;
  try {
    const res = await fetch("/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid }) });
    if (res.status === 403) forgetSession();
    return res.ok;
  } catch {
    return false;
  }
}
