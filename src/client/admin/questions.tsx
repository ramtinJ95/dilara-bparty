import { useRef, useState } from "preact/hooks";
import type { PhotoUploadResponse } from "../../shared/api";
import type { QuestionId } from "../../shared/model";
import type { AdminCmd } from "../../shared/protocol";
import { OPTION_MAX, OPTIONS, SECONDS, TEXT_MAX, type Question, type QuestionBody, type QuestionKind } from "../../shared/quiz";
import { LETTERS } from "../answers";
import { photoUrl } from "../api";
import { prepare } from "../photo-prep";
import { uploadErrors } from "./landing-photo";
import { blankDraft, draftOf, parseDraft, removeOption, type ChoiceDraft, type Draft } from "./question-draft";

type Mode = { kind: "idle" } | { kind: "edit"; id: QuestionId | null; start: Draft } | { kind: "delete"; id: QuestionId };

const KIND_LABEL: Record<QuestionKind, string> = { choice: "Multiple choice", number: "Closest number" };

type Props = { questions: Question[]; played: QuestionId[]; send: (cmd: AdminCmd) => void; live: boolean };

export function Questions({ questions, played, send, live }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const idle = () => setMode({ kind: "idle" });
  const editor = (id: QuestionId | null) =>
    mode.kind === "edit" && mode.id === id && (
      <Editor
        key={id ?? "new"}
        start={mode.start}
        live={live}
        onCancel={idle}
        onSave={(body) => {
          send({ t: "save-question", id, body });
          idle();
        }}
      />
    );

  return (
    <section class="card questions" aria-labelledby="questions-title">
      <h2 id="questions-title">
        Questions <span class="count">{questions.length}</span>
        {played.length > 0 && <span class="muted"> · {played.length} played</span>}
      </h2>
      {questions.length === 0 && mode.kind !== "edit" && <p class="muted empty">No questions yet. Add the first one below.</p>}
      <ol>
        {questions.map((q, i) => {
          const done = played.includes(q.id);
          return (
            <li key={q.id} class={done ? "played" : undefined}>
              {editor(q.id) || (
                <>
                  <div class="q-head">
                    <span class="q-n">{i + 1}</span>
                    <span class="badge kind">{KIND_LABEL[q.kind]}</span>
                    <span class="muted">{q.seconds} s</span>
                    {done && <span class="badge">Played</span>}
                    <span class="actions">
                      <button class="link" type="button" aria-label={`Move question ${i + 1} up`} disabled={!live || i === 0} onClick={() => send({ t: "move-question", id: q.id, to: i - 1 })}>
                        ↑
                      </button>
                      <button
                        class="link"
                        type="button"
                        aria-label={`Move question ${i + 1} down`}
                        disabled={!live || i === questions.length - 1}
                        onClick={() => send({ t: "move-question", id: q.id, to: i + 1 })}
                      >
                        ↓
                      </button>
                      <button class="link" type="button" disabled={done} onClick={() => setMode({ kind: "edit", id: q.id, start: draftOf(q) })}>
                        Edit
                      </button>
                      <button class="link danger" type="button" disabled={done} onClick={() => setMode({ kind: "delete", id: q.id })}>
                        Delete
                      </button>
                    </span>
                  </div>
                  <div class="q-body">
                    {q.photo && <img class="thumb" src={photoUrl(q.photo)} alt="" />}
                    <div>
                      <p class="q-text">{q.text}</p>
                      {q.kind === "choice" ? (
                        <ul class="q-options">
                          {q.options.map((o, j) => (
                            <li key={j} class={j === q.correct ? "correct" : undefined}>
                              {LETTERS[j]}. {o}
                              {j === q.correct && " ✓"}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p class="q-options">Answer: {q.answer}</p>
                      )}
                    </div>
                  </div>
                  {mode.kind === "delete" && mode.id === q.id && (
                    <div class="confirm">
                      <p class="warning">Delete question {i + 1}? This can't be undone.</p>
                      <div class="row">
                        <button
                          class="btn small danger"
                          type="button"
                          disabled={!live}
                          onClick={() => {
                            send({ t: "delete-question", id: q.id });
                            idle();
                          }}
                        >
                          Delete question
                        </button>
                        <button class="btn small secondary" type="button" onClick={idle}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
      {editor(null) || (
        <div class="row add">
          {(Object.keys(KIND_LABEL) as QuestionKind[]).map((kind) => (
            <button key={kind} class="btn small secondary" type="button" onClick={() => setMode({ kind: "edit", id: null, start: blankDraft[kind]() })}>
              + {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

type EditorProps = { start: Draft; live: boolean; onSave: (body: QuestionBody) => void; onCancel: () => void };

function Editor({ start, live, onSave, onCancel }: EditorProps) {
  const [draft, setDraft] = useState(start);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const parsed = parseDraft(draft);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }) as Draft);
  const setChoice = (fn: (d: ChoiceDraft) => ChoiceDraft) => setDraft((d) => (d.kind === "choice" ? fn(d) : d));

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = await prepare(file).then((p) => p.photo, () => null);
      if (!body) return setUploadError("Couldn't read that image.");
      const res = await fetch("/api/admin/question-photo", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body });
      if (!res.ok) return setUploadError(uploadErrors[res.status] ?? `Upload failed (HTTP ${res.status}).`);
      const { id } = (await res.json()) as PhotoUploadResponse;
      set({ photo: id });
    } catch {
      setUploadError("Network error. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      class="editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.ok && live && !uploading) onSave(parsed.value);
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <p class="badge kind">{KIND_LABEL[draft.kind]}</p>
      <label class="stack">
        <span>Question</span>
        <textarea class="field" rows={2} maxLength={TEXT_MAX} value={draft.text} onInput={(e) => set({ text: e.currentTarget.value })} autoFocus />
      </label>

      {draft.kind === "choice" ? (
        <fieldset class="options">
          <legend>Options · pick the correct one</legend>
          {draft.options.map((o, i) => (
            <div class="option" key={i}>
              <input
                type="radio"
                name="correct"
                checked={draft.correct === i}
                aria-label={`Option ${LETTERS[i]} is correct`}
                onChange={() => setChoice((d) => ({ ...d, correct: i }))}
              />
              <span class="letter">{LETTERS[i]}</span>
              <input
                class="field"
                value={o}
                maxLength={OPTION_MAX}
                aria-label={`Option ${LETTERS[i]}`}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  setChoice((d) => ({ ...d, options: d.options.map((x, j) => (j === i ? value : x)) }));
                }}
              />
              <button class="link" type="button" aria-label={`Remove option ${LETTERS[i]}`} disabled={draft.options.length <= OPTIONS.min} onClick={() => setChoice((d) => removeOption(d, i))}>
                ✕
              </button>
            </div>
          ))}
          {draft.options.length < OPTIONS.max && (
            <button class="link" type="button" onClick={() => setChoice((d) => ({ ...d, options: [...d.options, ""] }))}>
              + Add option
            </button>
          )}
        </fieldset>
      ) : (
        <label class="stack">
          <span>Correct answer</span>
          <input class="field short" inputMode="decimal" value={draft.answer} onInput={(e) => set({ answer: e.currentTarget.value })} />
        </label>
      )}

      <div class="row">
        <label class="stack">
          <span>Seconds</span>
          <input class="field short" type="number" min={SECONDS.min} max={SECONDS.max} step={1} value={draft.seconds} onInput={(e) => set({ seconds: e.currentTarget.value })} />
        </label>
        <div class="stack">
          <span>Photo (optional)</span>
          <div class="row">
            {draft.photo && <img class="thumb" src={photoUrl(draft.photo)} alt="Question photo" />}
            <button class="btn small secondary" type="button" disabled={uploading} onClick={() => picker.current?.click()}>
              {uploading ? "Uploading…" : draft.photo ? "Replace photo" : "Add photo"}
            </button>
            {draft.photo && (
              <button class="link" type="button" onClick={() => set({ photo: null })}>
                Remove photo
              </button>
            )}
            <input
              ref={picker}
              type="file"
              accept="image/*"
              hidden
              aria-label="Question photo file"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) void upload(file);
              }}
            />
          </div>
        </div>
      </div>
      {uploadError && (
        <p class="error" role="alert">
          {uploadError}
        </p>
      )}

      <div class="row">
        <button class="btn small" type="submit" disabled={!parsed.ok || !live || uploading}>
          Save question
        </button>
        <button class="btn small secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        {!parsed.ok && <span class="muted invalid">{parsed.error}</span>}
      </div>
    </form>
  );
}
