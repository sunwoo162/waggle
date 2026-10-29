import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function openAuthDatabase(filename: string) {
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const database = new Database(filename, { timeout: 5000 });
  chmodSync(filename, 0o600);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

export function hasAuthSchema(database: Database.Database): boolean {
  const rows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name: string;
  }[];
  const names = new Set(rows.map((row) => row.name));
  return ["user", "account", "session", "verification", "rateLimit"].every((name) =>
    names.has(name),
  );
}
