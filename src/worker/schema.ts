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
];

const VERSION_KEY = "schema_version";

export function migrate(storage: DurableObjectStorage): void {
  storage.transactionSync(() => {
    const version = storage.kv.get<number>(VERSION_KEY) ?? 0;
    for (const step of migrations.slice(version)) storage.sql.exec(step);
    storage.kv.put(VERSION_KEY, migrations.length);
  });
}
