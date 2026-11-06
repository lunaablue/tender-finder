// fetch-samples.mjs
//
// A small standalone script. It is NOT part of the Worker.
// It downloads one day of notices from two UK government services and saves
// the raw JSON into the samples/ folder (which Git ignores).
//
// Run it from the project folder with:
//   node scripts/fetch-samples.mjs 2026-11-05
//
// The day is optional. If you leave it out, it uses 2026-11-05.
//
// IMPORTANT: the web addresses and parameter names below were written from
// memory and must be checked against each service's official documentation
// before you rely on them. The script prints every address it calls, so you
// can see exactly what was requested.

import { mkdir, writeFile } from "node:fs/promises";

// The day to fetch, e.g. "2026-11-05". Covers the whole of that day (UTC).
const day = process.argv[2] ?? "2026-11-05";
const dayStart = `${day}T00:00:00`;
const nextDay = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000)
  .toISOString()
  .slice(0, 10);
const dayEnd = `${nextDay}T00:00:00`;

// Folder where the raw JSON files are saved.
const outDir = new URL("../samples/", import.meta.url);

// The services ask us not to send requests too quickly.
// 12 requests per 2 minutes is one request every 10 seconds, so we wait 10.5 seconds.
const pauseMs = 10500;
const maxPagesPerSource = 20; // safety limit so a bug cannot loop forever

// Wait for a number of milliseconds.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Download one address and return the parsed JSON.
async function getJson(url) {
  console.log(`GET ${url}`);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    // Show the start of the server's error message, to help find the problem.
    const body = (await response.text()).slice(0, 500);
    throw new Error(`HTTP ${response.status} from ${url}\nServer said: ${body}`);
  }
  return response.json();
}

// Save one page of raw JSON to the samples/ folder.
async function savePage(name, data) {
  await mkdir(outDir, { recursive: true });
  const file = new URL(name, outDir);
  await writeFile(file, JSON.stringify(data, null, 2));
  console.log(`Saved ${file.pathname}`);
}

// --- Find a Tender (OCDS release packages) -----------------------------------
// The first address is built from parameters. Later pages come from the
// "next" link that the service returns with each page.
async function fetchFindATender() {
  const params = new URLSearchParams({
    updatedFrom: dayStart, // parameter name to check in the official docs
    updatedTo: dayEnd,     // parameter name to check in the official docs
    limit: "100",          // page size to check in the official docs
  });
  let url = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?${params}`;

  for (let page = 1; page <= maxPagesPerSource && url; page++) {
    const data = await getJson(url);
    await savePage(`find-tender-${day}-page${page}.json`, data);
    // The "next" link is expected under links.next. Check this in the docs.
    url = data?.links?.next ?? null;
    if (url) await wait(pauseMs);
  }
}

// --- Contracts Finder (OCDS search) ------------------------------------------
// Pages are numbered, starting at 1. We stop when a page has no notices.
// The page number is ignored by this service, so we follow the "next" link
// (which holds a cursor) instead, the same way as Find a Tender.
async function fetchContractsFinder() {
  const params = new URLSearchParams({
    publishedFrom: day,      // parameter name to check in the official docs
    publishedTo: nextDay,    // end date is the day AFTER, in case the end date is exclusive
    limit: "100",
  });
  let url = `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?${params}`;

  for (let page = 1; page <= maxPagesPerSource && url; page++) {
    const data = await getJson(url);
    await savePage(`contracts-finder-${day}-page${page}.json`, data);
    // Stop when there is no next link, or the page is empty.
    const count = Array.isArray(data?.releases) ? data.releases.length : 0;
    url = count > 0 ? (data?.links?.next ?? null) : null;
    if (url) await wait(pauseMs);
  }
}

// Run both sources one after the other, so we never send requests together.
try {
  console.log(`Fetching notices published on ${day}`);
  await fetchFindATender();
  await wait(pauseMs);
  await fetchContractsFinder();
  console.log("Done. Raw JSON is in the samples/ folder.");
} catch (error) {
  console.error("Stopped with an error:", error.message);
  process.exitCode = 1;
}
