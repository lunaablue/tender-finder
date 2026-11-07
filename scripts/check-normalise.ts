// check-normalise.ts
//
// An offline check. It reads the raw JSON you saved in samples/ and runs the
// same normalise / award / duplicate code the Worker uses. No internet is needed.
//
// Run from the project folder with:
//   node --experimental-strip-types scripts/check-normalise.ts

import { readdirSync, readFileSync } from "node:fs";
import { dropAwards, normaliseRelease, removeDuplicates } from "../src/normalise.ts";
import type { Notice, Release, Source } from "../src/types.ts";

const samplesDir = new URL("../samples/", import.meta.url);

// Load every saved page for one source, in page order.
function loadRaw(prefix: string): Release[] {
  return readdirSync(samplesDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .flatMap((f) => (JSON.parse(readFileSync(new URL(f, samplesDir), "utf8")).releases ?? []) as Release[]);
}

const findTenderRaw = loadRaw("find-tender-");
const contractsFinderRaw = loadRaw("contracts-finder-");

const normalised: Notice[] = [
  ...findTenderRaw.map((r) => normaliseRelease(r, "find-tender" as Source)),
  ...contractsFinderRaw.map((r) => normaliseRelease(r, "contracts-finder" as Source)),
];
const withoutAwards = dropAwards(normalised);
const kept = removeDuplicates(withoutAwards);

console.log("Raw releases:", { findTender: findTenderRaw.length, contractsFinder: contractsFinderRaw.length });
console.log("Normalised:", normalised.length);
console.log("Awards dropped:", normalised.length - withoutAwards.length);
console.log("Duplicates removed:", withoutAwards.length - kept.length);
console.log("Kept:", kept.length);
console.log("By source:", kept.reduce<Record<string, number>>((a, n) => ((a[n.source] = (a[n.source] ?? 0) + 1), a), {}));
console.log("By stage:", kept.reduce<Record<string, number>>((a, n) => ((a[n.stage] = (a[n.stage] ?? 0) + 1), a), {}));

// Checks that must always hold.
const ids = kept.map((n) => n.id);
const problems: string[] = [];
if (kept.some((n) => n.stage === "award")) problems.push("an award notice was kept");
if (new Set(ids).size !== ids.length) problems.push("a duplicate ID was kept");
if (problems.length) {
  console.error("CHECK FAILED:", problems);
  process.exitCode = 1;
} else {
  console.log("Checks passed: no awards, no duplicate IDs.");
}

// Show the first two kept notices in full, so the shape is easy to see.
console.log("\nFirst two notices:");
console.log(JSON.stringify(kept.slice(0, 2), null, 2));
