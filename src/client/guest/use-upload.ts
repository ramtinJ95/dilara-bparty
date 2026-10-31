import { useEffect, useRef, useState } from "preact/hooks";
import type { PhotoId } from "../../shared/model";
import { prepare } from "../photo-prep";
import { startUpload, type Upload, type UploadPhase } from "../upload";

export type Progress = { phase: "preparing" } | Exclude<UploadPhase, { phase: "failed" }>;
export type Uploading = { preview: string | null; progress: Progress };
export type Uploader = {
  current: Uploading | null;
  error: string | null;
  pick: (file: File) => void;
};

const UNREADABLE = "Den bilden gick inte att läsa. Prova en annan.";
const SUPERSEDED_GRACE_MS = 2_000;

// A retried upload can succeed after the photo was already replaced, removed or merged away, so its id may never become ours.
export const settleDelay = (uploaded: PhotoId, mine: PhotoId | null) => (uploaded === mine ? 0 : SUPERSEDED_GRACE_MS);

/** One upload at a time, kept above the tabs so switching tab doesn't stop it. It ends once the snapshot shows the new photo. */
export function useUploader(mine: PhotoId | null): Uploader {
  const [current, setCurrent] = useState<Uploading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<Upload | null>(null);
  const preview = useRef<string | null>(null);
  const picks = useRef(0);

  const clear = () => {
    upload.current?.cancel();
    upload.current = null;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
    setCurrent(null);
  };

  useEffect(() => clear, []);
  useEffect(() => {
    if (current?.progress.phase !== "done") return;
    const wait = settleDelay(current.progress.id, mine);
    if (wait === 0) return clear();
    const timer = setTimeout(clear, wait);
    return () => clearTimeout(timer);
  }, [current, mine]);

  async function pick(file: File) {
    clear();
    const pickNo = ++picks.current;
    setError(null);
    setCurrent({ preview: null, progress: { phase: "preparing" } });
    let prepared;
    try {
      prepared = await prepare(file);
    } catch {
      if (pickNo !== picks.current) return;
      setCurrent(null);
      return setError(UNREADABLE);
    }
    if (pickNo !== picks.current) return;
    const url = URL.createObjectURL(prepared.thumb);
    preview.current = url;
    upload.current = startUpload(prepared, (phase) => {
      if (phase.phase !== "failed") return setCurrent({ preview: url, progress: phase });
      clear();
      setError(phase.error);
    });
  }

  return { current, error, pick: (file) => void pick(file) };
}
