// Runs the whole fetch: download both services, normalise, drop awards, remove duplicates.
// No AI is called here.

import { sleep, PAUSE_MS } from "./http.ts";
import { daysBackFrom, windowFor } from "./window.ts";
import { fetchContractsFinder, fetchFindTender } from "./sources.ts";
import { dropAwards, normaliseRelease, removeDuplicates } from "./normalise.ts";
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
    kept: number;
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

  const withoutAwards = dropAwards(normalised);
  const kept = removeDuplicates(withoutAwards);

  const counts = {
    findTenderReleases: findTender.length,
    contractsFinderReleases: contractsFinder.length,
    normalised: normalised.length,
    awardsDropped: normalised.length - withoutAwards.length,
    duplicatesRemoved: withoutAwards.length - kept.length,
    kept: kept.length,
  };
  console.log("Counts:", JSON.stringify(counts));

  return {
    daysBack,
    window: { from: w.fromIso, to: w.toIso },
    counts,
    notices: kept,
  };
}
