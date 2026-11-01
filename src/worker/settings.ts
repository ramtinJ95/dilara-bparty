export type Settings = ReadonlyMap<string, string>;

export const readSettings = (sql: SqlStorage): Settings =>
  new Map(sql.exec<{ key: string; value: string }>("SELECT key, value FROM settings").toArray().map((row) => [row.key, row.value]));
