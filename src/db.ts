// Saving notices and run logs to the D1 database.

import { isLowPriority } from "./prefilter.ts";
import type { Notice } from "./types.ts";

// How many inserts to send to the database in one batch.
const BATCH_SIZE = 50;

// Save only notices we have not seen before. "INSERT OR IGNORE" skips any notice
// whose ID is already in the table. Returns how many were actually saved.
export async function saveNewNotices(db: D1Database, notices: Notice[], firstSeenAt: string): Promise<number> {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO notices (
       id, source, ocid, title, description, buyer, value, currency, deadline, stage,
       cpv_codes, procurement_category, region, url, published_date, first_seen_at, low_priority
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const statements = notices.map((n) =>
    insert.bind(
      n.id,
      n.source,
      n.ocid,
      n.title,
      n.description,
      n.buyer,
      n.value,
      n.currency,
      n.deadline,
      n.stage,
      JSON.stringify(n.cpvCodes),
      n.procurementCategory,
      n.region,
      n.url,
      n.publishedDate,
      firstSeenAt,
      isLowPriority(n) ? 1 : 0,
    ),
  );

  let saved = 0;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const results = await db.batch(statements.slice(i, i + BATCH_SIZE));
    // "changes" is 1 when a row was inserted, and 0 when it was skipped as already seen.
    saved += results.reduce((total, r) => total + (r.meta.changes ?? 0), 0);
  }
  return saved;
}

export interface RunLog {
  startedAt: string;
  fetched: number;
  new: number;
  kept: number;
  scored: number;
  errors: string | null;
}

// Write one row to the runs table.
export async function logRun(db: D1Database, run: RunLog): Promise<void> {
  await db
    .prepare(
      `INSERT INTO runs (started_at, fetched, new, kept, scored, errors) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(run.startedAt, run.fetched, run.new, run.kept, run.scored, run.errors)
    .run();
}
