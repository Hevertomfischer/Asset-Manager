import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const migrationsDir = fileURLToPath(new URL("../../../../lib/db/drizzle/", import.meta.url));
const journal: { entries: { idx: number; when: number; tag: string }[] } = JSON.parse(
  readFileSync(`${migrationsDir}/meta/_journal.json`, "utf8"),
);

test("every SQL migration is registered once and in order", () => {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  expect(journal.entries.map(({ tag }) => `${tag}.sql`)).toEqual(files);
  expect(journal.entries.map(({ idx }) => idx)).toEqual(files.map((_, index) => index));
  expect(new Set(journal.entries.map(({ when }) => when)).size).toBe(files.length);
  for (let index = 1; index < journal.entries.length; index++) {
    expect(journal.entries[index]!.when).toBeGreaterThan(journal.entries[index - 1]!.when);
  }
});

test.each([
  ["0009_add_mcp_clients.sql", "mcp_clients"],
  ["0010_add_feedback.sql", "feedback"],
])("%s creates its table idempotently", (file, table) => {
  const ddl = readFileSync(`${migrationsDir}/${file}`, "utf8");
  expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
  expect(ddl).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
});
