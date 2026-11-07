// Helpers for downloading data politely: pause between requests, retry when refused,
// and follow the "next page" links until there are no more pages.

import type { Release } from "./types.ts";

// Wait this long between requests. Find a Tender is reported at about
// 12 requests per 2 minutes, which is one every 10 seconds. We wait 10.5 seconds to be safe.
// This figure is unverified (see PLAN.md) and must be checked in the official docs.
export const PAUSE_MS = 10_500;

// If a request is refused, wait this long before trying again: 30 s, then 60 s, then 120 s.
const RETRY_WAITS_MS = [30_000, 60_000, 120_000];

// Safety limit so a bug in the "next page" link cannot loop forever.
const MAX_PAGES = 50;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Download one web address and return the JSON. If it is refused (too many requests,
// or the server is busy) or the network fails, wait and try again.
export async function getJsonWithRetry(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (error) {
      // The network failed. Retry if we have waits left, otherwise give up.
      if (attempt >= RETRY_WAITS_MS.length) throw error;
      console.log(`Network error, retrying in ${RETRY_WAITS_MS[attempt] / 1000}s: ${error}`);
      await sleep(RETRY_WAITS_MS[attempt]);
      continue;
    }

    if (response.ok) {
      return response.json();
    }

    // 429 means "too many requests", and 5xx means the server is busy or broken.
    // Both are worth retrying later. Other errors (such as 400) are not.
    const refused = response.status === 429 || response.status >= 500;
    if (refused && attempt < RETRY_WAITS_MS.length) {
      console.log(`HTTP ${response.status} from ${url}, retrying in ${RETRY_WAITS_MS[attempt] / 1000}s`);
      await sleep(RETRY_WAITS_MS[attempt]);
      continue;
    }

    const body = (await response.text()).slice(0, 300);
    throw new Error(`HTTP ${response.status} from ${url}: ${body}`);
  }
}

// Download every page of results, starting from the first address.
// Each page is expected to hold a "releases" list and a "links.next" address.
// We stop when there is no next link or a page comes back empty.
export async function fetchAllReleases(firstUrl: string, label: string): Promise<Release[]> {
  const all: Release[] = [];
  let url: string | null = firstUrl;

  for (let page = 1; url && page <= MAX_PAGES; page++) {
    console.log(`[${label}] downloading page ${page}`);
    const data = (await getJsonWithRetry(url)) as {
      releases?: Release[];
      links?: { next?: string };
    };
    const releases = data.releases ?? [];
    all.push(...releases);

    url = releases.length > 0 ? (data.links?.next ?? null) : null;
    if (url) await sleep(PAUSE_MS);
  }

  console.log(`[${label}] downloaded ${all.length} releases`);
  return all;
}
