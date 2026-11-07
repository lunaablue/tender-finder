// check-save.ts
//
// An offline check of the database code. It runs the real migration SQL and the
// real save code, using Node's built-in SQLite as a stand-in for D1, and a fake
// internet that serves the pages saved in samples/.
//
// It runs the whole job twice. The second run must save nothing new.
//
// Run from the project folder with:
//   node --no-warnings --experimental-strip-types scripts/check-save.ts

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOnce } from "../src/run.ts";

const projectDir = new URL("../", import.meta.url);
const samplesDir = new URL("../samples/", import.meta.url);

// Make waits instant so the check runs quickly.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;

// --- A stand-in for D1 built on Node's SQLite -------------------------------
// It offers only the parts of the D1 API that our code uses.
type Stmt = { sql: string; params: unknown[] };
function fakeD1(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const stmt: Stmt = { sql, params };
          return {
            ...stmt,
            async run() {
              const r = sqlite.prepare(sql).run(...(params as never[]));
              return { meta: { changes: Number(r.changes) } };
            },
          };
        },
      };
    },
    async batch(statements: Stmt[]) {
      return statements.map((s) => {
        const r = sqlite.prepare(s.sql).run(...(s.params as never[]));
        return { meta: { changes: Number(r.changes) } };
      });
    },
    exec: (sql: string) => sqlite.exec(sql),
    query: (sql: string) => sqlite.prepare(sql).all(),
  };
  return db;
}

// --- A fake internet that serves the saved pages ----------------------------
function pagesFor(prefix: string) {
  return readdirSync(samplesDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort((a, b) => Number(a.match(/page(\d+)/)?.[1]) - Number(b.match(/page(\d+)/)?.[1]))
    .map((file) => JSON.parse(readFileSync(new URL(file, samplesDir), "utf8")));
}
const ftPages = pagesFor("find-tender-");
const cfPages = pagesFor("contracts-finder-");

function serve(pages: { links?: { next?: string } }[], url: string): Response {
  const index = url.includes("cursor=") ? pages.findIndex((p, i) => i > 0 && pages[i - 1].links?.next === url) : 0;
  if (index < 0) return new Response("unknown cursor", { status: 400 });
  return Response.json(pages[index]);
}
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("find-tender")) return serve(ftPages, url);
  if (url.includes("contractsfinder")) return serve(cfPages, url);
  return new Response("not expected", { status: 500 });
}) as typeof fetch;

// --- Set up a fresh test database and apply the migration -------------------
const dbPath = join(mkdtempSync(join(tmpdir(), "tender-finder-test-")), "test.sqlite");
const db = fakeD1(dbPath);
const migrationSql = readFileSync(new URL("migrations/0001_create_tables.sql", projectDir), "utf8");
db.exec(migrationSql);
console.log("Migration applied to a test database.");

const env = { DAYS_BACK: "2", DB: db as unknown as D1Database };
const now = new Date("2026-11-07T10:00:00Z");

// --- Run twice --------------------------------------------------------------
const first = await runOnce(env, now);
console.log("\nRun 1:", first);
const second = await runOnce(env, new Date("2026-11-07T11:00:00Z"));
console.log("Run 2:", second);

// --- Checks -----------------------------------------------------------------
const stored = db.query("SELECT COUNT(*) AS n FROM notices")[0].n as number;
const runRows = db.query("SELECT COUNT(*) AS n FROM runs")[0].n as number;
const problems: string[] = [];
if (first.new !== first.kept) problems.push(`run 1 should save all ${first.kept} kept notices, saved ${first.new}`);
if (second.new !== 0) problems.push(`run 2 should save nothing new, saved ${second.new}`);
if (stored !== first.kept) problems.push(`notices table has ${stored} rows, expected ${first.kept}`);
if (runRows !== 2) problems.push(`runs table has ${runRows} rows, expected 2`);

if (problems.length) {
  console.error("\nCHECK FAILED:", problems);
  process.exitCode = 1;
} else {
  console.log(`\nChecks passed: ${stored} notices stored, second run saved nothing new, 2 run rows logged.`);
}

// Show what the two tables now hold.
console.log("\nruns table:");
console.table(db.query("SELECT * FROM runs"));
console.log("notices table (first 3 rows, selected columns):");
console.table(db.query("SELECT id, source, title, value, stage, low_priority FROM notices LIMIT 3"));
