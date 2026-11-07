// One full run: fetch, filter, save new notices, and log the run.

import { collectNotices } from "./collect.ts";
import { logRun, saveNewNotices } from "./db.ts";
import type { Env } from "./index.ts";

export interface RunSummary {
  startedAt: string;
  fetched: number;
  new: number;
  kept: number;
  scored: number;
  errors: string | null;
}

export async function runOnce(env: Env, now: Date): Promise<RunSummary> {
  const startedAt = now.toISOString();
  let fetched = 0;

  try {
    const result = await collectNotices(env, now);
    fetched = result.counts.findTenderReleases + result.counts.contractsFinderReleases;

    const saved = await saveNewNotices(env.DB, result.notices, startedAt);
    console.log(`Saved ${saved} new notices (${result.notices.length - saved} already seen)`);

    const summary: RunSummary = {
      startedAt,
      fetched,
      new: saved,
      kept: result.counts.kept,
      scored: 0,
      errors: null,
    };
    await logRun(env.DB, summary);
    return summary;
  } catch (error) {
    // Record the failure in the runs table, then pass the error on.
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Run failed: ${message}`);
    try {
      await logRun(env.DB, { startedAt, fetched, new: 0, kept: 0, scored: 0, errors: message });
    } catch (logError) {
      console.log(`Could not write to the runs table either: ${logError}`);
    }
    throw error;
  }
}
