import { useEffect, useState } from "preact/hooks";
import { Snowflake, Sparkle, Tiara } from "../icons";

const SEEN_KEY = "quiz-unlock-seen";

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

// Keyed by unlockedAt, so a phone that was asleep or joined late still gets the news once,
// and a quiz that is reset and unlocked again announces itself again.
export function useUnlockNotice(unlockedAt: number | null, onQuizTab: boolean) {
  const [seen, setSeen] = useState(readSeen);
  const fresh = unlockedAt !== null && seen !== String(unlockedAt);
  const markSeen = () => {
    if (unlockedAt === null) return;
    try {
      localStorage.setItem(SEEN_KEY, String(unlockedAt));
    } catch {}
    setSeen(String(unlockedAt));
  };
  const show = fresh && !onQuizTab;
  useEffect(() => {
    if (fresh && onQuizTab) markSeen();
  }, [fresh, onQuizTab]);
  useEffect(() => {
    if (show) navigator.vibrate?.([200, 100, 200]);
  }, [show]);
  return { show, markSeen };
}

export function UnlockPopup({ onGo, onLater }: { onGo: () => void; onLater: () => void }) {
  return (
    <div class="scrim">
      <div class="popup card" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
        <div class="flakes" aria-hidden="true">
          <Snowflake />
          <Snowflake />
          <Snowflake />
        </div>
        <Tiara />
        <h2 id="unlock-title">Quizet har börjat!</h2>
        <p>Hoppa in och var med!</p>
        <button class="btn" type="button" onClick={onGo} autoFocus>
          Till quizet
        </button>
        <button class="btn secondary" type="button" onClick={onLater}>
          Inte nu
        </button>
        <Sparkle class="sparkle a" />
        <Sparkle class="sparkle b" />
        <Sparkle class="sparkle c" />
      </div>
    </div>
  );
}
