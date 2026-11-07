// check-collect.ts
//
// An offline check of the fetch code (paging, retry and the date window).
// It replaces the internet with a fake that serves the pages saved in samples/,
// and makes one request fail with "429 too many requests" to test the retry.
// Waits are shortened so the check finishes quickly.
//
// Run from the project folder with:
//   node --no-warnings --experimental-strip-types scripts/check-collect.ts

import { readdirSync, readFileSync } from "node:fs";
import { collectNotices } from "../src/collect.ts";
import { daysBackFrom, windowFor } from "../src/window.ts";

const samplesDir = new URL("../samples/", import.meta.url);

// Make all waits instant, so the check runs quickly.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;

function pagesFor(prefix: string): { file: string; data: { releases: unknown[]; links?: { next?: string } } }[] {
  return readdirSync(samplesDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort((a, b) => Number(a.match(/page(\d+)/)?.[1]) - Number(b.match(/page(\d+)/)?.[1]))
    .map((file) => ({ file, data: JSON.parse(readFileSync(new URL(file, samplesDir), "utf8")) }));
}

const ftPages = pagesFor("find-tender-");
const cfPages = pagesFor("contracts-finder-");
const seenUrls: string[] = [];
let refusedOnce = false;

// Serve the saved page that a given address should return.
function serve(pages: typeof ftPages, url: string): Response {
  const cursorIndex = pages.findIndex((p, i) => i > 0 && pages[i - 1].data.links?.next === url);
  const index = url.includes("cursor=") ? cursorIndex : 0;
  if (index < 0) return new Response("unknown cursor", { status: 400 });
  return Response.json(pages[index].data);
}

// Fake fetch: one 429 on the first Find a Tender page, then the saved pages.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  seenUrls.push(url);
  if (url.includes("find-tender") && !refusedOnce) {
    refusedOnce = true;
    return new Response("slow down", { status: 429 });
  }
  if (url.includes("find-tender")) return serve(ftPages, url);
  if (url.includes("contractsfinder")) return serve(cfPages, url);
  return new Response("not expected in this check", { status: 500 });
}) as typeof fetch;

// --- 1. The date window and the DAYS_BACK setting ---------------------------
const now = new Date("2026-11-07T10:00:00Z");
console.log("Default DAYS_BACK:", daysBackFrom({}));
console.log("DAYS_BACK='5':", daysBackFrom({ DAYS_BACK: "5" }));
try {
  daysBackFrom({ DAYS_BACK: "two" });
  console.log("FAIL: a bad DAYS_BACK was accepted");
} catch {
  console.log("Bad DAYS_BACK is rejected: ok");
}
console.log("Window for DAYS_BACK=2:", windowFor(now, 2));

// --- 2. Fetch everything through the fake internet --------------------------
const result = await collectNotices({ DAYS_BACK: "2" }, now);

const ftCalls = seenUrls.filter((u) => u.includes("find-tender")).length;
const cfCalls = seenUrls.filter((u) => u.includes("contractsfinder")).length;
console.log("\nRequests made: Find a Tender", ftCalls, "(incl. 1 refused), Contracts Finder", cfCalls);
console.log("Retry after refusal exercised:", refusedOnce ? "yes" : "no");
console.log("Counts:", result.counts);

const problems: string[] = [];
if (ftCalls !== ftPages.length + 1) problems.push(`expected ${ftPages.length + 1} Find a Tender requests`);
if (cfCalls !== cfPages.length) problems.push(`expected ${cfPages.length} Contracts Finder requests`);
if (result.counts.findTenderReleases !== ftPages.reduce((n, p) => n + p.data.releases.length, 0)) {
  problems.push("Find a Tender release count does not match the saved pages");
}
if (result.notices.some((n) => n.stage === "award")) problems.push("an award was kept");
if (problems.length) {
  console.error("CHECK FAILED:", problems);
  process.exitCode = 1;
} else {
  console.log("Checks passed: paging, retry, award filter and counts all behaved.");
}
