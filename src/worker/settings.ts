export type Settings = ReadonlyMap<string, string>;

export const readSettings = (sql: SqlStorage): Settings =>
  new Map(sql.exec<{ key: string; value: string }>("SELECT key, value FROM settings").toArray().map((row) => [row.key, row.value]));

export const putSetting = (sql: SqlStorage, key: string, value: string): void =>
  void sql.exec("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);

export const deleteSetting = (sql: SqlStorage, key: string): void => void sql.exec("DELETE FROM settings WHERE key = ?", key);
