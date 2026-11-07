// Runs the whole fetch: download both services, normalise, drop awards, remove duplicates.
// No AI is called here.

import { sleep, PAUSE_MS } from "./http.ts";
import { daysBackFrom, windowFor } from "./window.ts";
import { fetchContractsFinder, fetchFindTender } from "./sources.ts";
import { normaliseRelease } from "./normalise.ts";
import { runPreFilter } from "./prefilter.ts";
import type { Notice } from "./types.ts";

export interface CollectResult {
  daysBack: number;
  window: { from: string; to: string };
  counts: {
    findTenderReleases: number;
    contractsFinderReleases: number;
    normalised: number;
    awardsDropped: number;
    duplicatesRemoved: number;
    removedByCategory: number;
    removedByDeadline: number;
    removedAsPollingOrResearch: number;
    removedNotOnTopic: number;
    kept: number;
    lowPriorityFlagged: number;
  };
  notices: Notice[];
}

export async function collectNotices(env: { DAYS_BACK?: string }, now: Date): Promise<CollectResult> {
  const daysBack = daysBackFrom(env);
  const w = windowFor(now, daysBack);
  console.log(`Fetching notices from ${w.fromIso} to ${w.toIso} (DAYS_BACK=${daysBack})`);

  // Download one service, then wait before the next, to stay under the rate limit.
  const findTender = await fetchFindTender(w.fromIso, w.toIso);
  await sleep(PAUSE_MS);
  const contractsFinder = await fetchContractsFinder(w.fromDate, w.toDate);

  const normalised: Notice[] = [
    ...findTender.map((r) => normaliseRelease(r, "find-tender")),
    ...contractsFinder.map((r) => normaliseRelease(r, "contracts-finder")),
  ];

  // Run every pre-filter rule, and get back how many notices each one removed.
  const filtered = runPreFilter(normalised, now);
  const c = filtered.counts;

  const counts = {
    findTenderReleases: findTender.length,
    contractsFinderReleases: contractsFinder.length,
    normalised: normalised.length,
    awardsDropped: c.removedByStage,
    duplicatesRemoved: c.removedDuplicates,
    removedByCategory: c.removedByCategory,
    removedByDeadline: c.removedByDeadline,
    removedAsPollingOrResearch: c.removedAsPollingOrResearch,
    removedNotOnTopic: c.removedNotOnTopic,
    kept: c.kept,
    lowPriorityFlagged: c.lowPriorityFlagged,
  };

  // Log what each rule did, so you can see why a notice went missing.
  console.log(
    `Pre-filter: ${normalised.length} in, ` +
      `${counts.awardsDropped} dropped as not open/pipeline (stage), ` +
      `${counts.duplicatesRemoved} duplicates, ` +
      `${counts.removedByCategory} not services (category), ` +
      `${counts.removedByDeadline} closing in under 3 days, ` +
      `${counts.removedAsPollingOrResearch} polling/research, ` +
      `${counts.removedNotOnTopic} not on topic, ` +
      `${counts.kept} kept, ${counts.lowPriorityFlagged} flagged low priority`,
  );
  console.log("Counts:", JSON.stringify(counts));

  return {
    daysBack,
    window: { from: w.fromIso, to: w.toIso },
    counts,
    notices: filtered.kept,
  };
}
