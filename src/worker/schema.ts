type Migration = string | ((storage: DurableObjectStorage) => void);

// The single finale became a quiz finale and a photo finale. Its stage said how far it had got, and each revealed winner is
// already frozen in the shape the new finales keep.
function splitFinale({ kv }: DurableObjectStorage): void {
  const stage = kv.get<"suspense" | "quiz" | "photo">("finale_stage");
  const done = (key: string) => ({ stage: "done", win: kv.get(key) ?? (key === "finale_quiz" ? [] : null) });
  if (stage === "suspense") kv.put("quiz_finale", { stage: "suspense" });
  if (stage === "quiz" || stage === "photo") kv.put("quiz_finale", done("finale_quiz"));
  if (stage === "photo") kv.put("photo_finale", done("finale_photo"));
  for (const key of ["finale_stage", "finale_quiz", "finale_photo"]) kv.delete(key);
}

const migrations: Migration[] = [
  `CREATE TABLE players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    merged_into TEXT NULL REFERENCES players(id),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX players_merged_into ON players(merged_into);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  `CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    owner TEXT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    bytes BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE entries (
    photo TEXT PRIMARY KEY REFERENCES photos(id),
    thumb TEXT NOT NULL REFERENCES photos(id),
    owner TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('current', 'replaced', 'removed')),
    hidden INTEGER NOT NULL DEFAULT 0,
    upload_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX entries_one_current ON entries(owner) WHERE status = 'current';
  CREATE INDEX entries_thumb ON entries(thumb);
  CREATE TABLE votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter TEXT NOT NULL,
    photo TEXT NOT NULL
  );
  CREATE INDEX votes_voter ON votes(voter);
  CREATE INDEX votes_photo ON votes(photo);`,
  `CREATE TABLE questions (id TEXT PRIMARY KEY, position INTEGER NOT NULL, body TEXT NOT NULL);
  CREATE TABLE rounds (
    question_id TEXT PRIMARY KEY,
    n INTEGER NOT NULL UNIQUE,
    started_at INTEGER NOT NULL,
    deadline INTEGER NOT NULL,
    revealed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE answers (
    question_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    pick REAL NOT NULL,
    ms INTEGER NOT NULL,
    points INTEGER NULL,
    answered_at INTEGER NOT NULL,
    PRIMARY KEY (question_id, player_id)
  );
  CREATE TABLE deliveries (
    question_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY (question_id, player_id)
  );`,
  splitFinale,
];

const VERSION_KEY = "schema_version";

export function migrate(storage: DurableObjectStorage): void {
  storage.transactionSync(() => {
    const version = storage.kv.get<number>(VERSION_KEY) ?? 0;
    if (version === migrations.length) return;
    for (const step of migrations.slice(version)) {
      if (typeof step === "string") storage.sql.exec(step);
      else step(storage);
    }
    storage.kv.put(VERSION_KEY, migrations.length);
  });
}
