// The two web addresses we download from. Both are free and need no key.
//
// Parameter names were tested against the live services on 5 November 2026
// (see the step 2 notes in PLAN.md). Check them again if a request is refused.

import { fetchAllReleases } from "./http.ts";
import type { Release } from "./types.ts";

// Find a Tender: notices updated within the window (updatedFrom / updatedTo).
export function findTenderUrl(fromIso: string, toIso: string): string {
  const params = new URLSearchParams({ updatedFrom: fromIso, updatedTo: toIso, limit: "100" });
  return `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?${params}`;
}

// Contracts Finder: notices published within the window (publishedFrom / publishedTo, as dates).
export function contractsFinderUrl(fromDate: string, toDate: string): string {
  const params = new URLSearchParams({ publishedFrom: fromDate, publishedTo: toDate, limit: "100" });
  return `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?${params}`;
}

export function fetchFindTender(fromIso: string, toIso: string): Promise<Release[]> {
  return fetchAllReleases(findTenderUrl(fromIso, toIso), "find-tender");
}

export function fetchContractsFinder(fromDate: string, toDate: string): Promise<Release[]> {
  return fetchAllReleases(contractsFinderUrl(fromDate, toDate), "contracts-finder");
}
