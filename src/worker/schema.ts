const migrations = [
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
];

const VERSION_KEY = "schema_version";

export function migrate(storage: DurableObjectStorage): void {
  storage.transactionSync(() => {
    const version = storage.kv.get<number>(VERSION_KEY) ?? 0;
    for (const step of migrations.slice(version)) storage.sql.exec(step);
    storage.kv.put(VERSION_KEY, migrations.length);
  });
}
