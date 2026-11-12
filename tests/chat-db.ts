import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
// Execute the real schema and SQL in SQLite; this adapter only mirrors D1's result envelope.
export function chatDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("server/schema.sql", "utf8"));
  sqlite.exec(readFileSync("server/chat-schema.sql", "utf8"));
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let args: (string | number | null)[] = [];
      return {
        bind(...values: (string | number | null)[]) {
          args = values;
          return this;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { results: statement.all(...args), success: true };
        },
        async run() {
          statement.run(...args);
          return { success: true };
        },
      };
    },
  };
  return { sqlite, db: db as unknown as D1Database };
}
