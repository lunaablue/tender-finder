// Tests for the pre-filter rules. Each test uses a made-up example notice.
//
// Run from the project folder with:
//   node --test --experimental-strip-types tests/prefilter.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLowPriority,
  keepCategory,
  keepDeadline,
  keepNotPolling,
  keepOnTopic,
  keepStage,
  normaliseForMatch,
  runPreFilter,
} from "../src/prefilter.ts";
import type { Notice } from "../src/types.ts";

// A fixed "now" so deadline tests are predictable.
const NOW = new Date("2026-11-07T12:00:00Z");

// Make an example notice. Anything not given gets a sensible default.
function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: "test-1",
    source: "find-tender",
    ocid: null,
    title: "Example procurement",
    description: null,
    buyer: "Example Council",
    value: 1_000_000,
    currency: "GBP",
    deadline: "2026-12-20T12:00:00Z",
    stage: "tender",
    cpvCodes: [],
    procurementCategory: "services",
    region: "UKI",
    url: null,
    publishedDate: "2026-11-06T09:00:00Z",
    ...overrides,
  };
}

// --- Matching helpers ---------------------------------------------------------

test("matching ignores capital letters", () => {
  const n = notice({ title: "ARTIFICIAL INTELLIGENCE for case handling" });
  assert.equal(keepOnTopic(n), true);
});

test("'dual use' and 'dual-use' are treated the same", () => {
  assert.equal(normaliseForMatch("Dual-Use technology"), "dual use technology");
  assert.equal(keepOnTopic(notice({ title: "Dual-use sensors" })), true);
  assert.equal(keepOnTopic(notice({ title: "Dual use sensors" })), true);
});

// --- Rule 1: keep only open tenders and pipeline notices --------------------

test("stage: an open tender is kept", () => {
  assert.equal(keepStage(notice({ stage: "tender" })), true);
});

test("stage: a pipeline notice is kept", () => {
  assert.equal(keepStage(notice({ stage: "pipeline" })), true);
});

test("stage: a contract award is dropped", () => {
  assert.equal(keepStage(notice({ stage: "award" })), false);
});

test("stage: a cancellation is dropped", () => {
  assert.equal(keepStage(notice({ stage: "tenderCancellation" })), false);
});

// --- Rule 2: services only -----------------------------------------------------

test("category: services are kept", () => {
  assert.equal(keepCategory(notice({ procurementCategory: "services" })), true);
});

test("category: goods are dropped", () => {
  assert.equal(keepCategory(notice({ procurementCategory: "goods" })), false);
});

test("category: works are dropped", () => {
  assert.equal(keepCategory(notice({ procurementCategory: "works" })), false);
});

test("category: a notice with no category is dropped", () => {
  assert.equal(keepCategory(notice({ procurementCategory: null })), false);
});

// --- Rule 3: deadline ------------------------------------------------------------

test("deadline: an open tender closing in 1 day is dropped", () => {
  const n = notice({ stage: "tender", deadline: "2026-11-08T12:00:00Z" });
  assert.equal(keepDeadline(n, NOW), false);
});

test("deadline: an open tender closing in 5 days is kept", () => {
  const n = notice({ stage: "tender", deadline: "2026-11-12T12:00:00Z" });
  assert.equal(keepDeadline(n, NOW), true);
});

test("deadline: a pipeline notice with no deadline is kept", () => {
  const n = notice({ stage: "pipeline", deadline: null });
  assert.equal(keepDeadline(n, NOW), true);
});

test("deadline: an open tender with no deadline is kept", () => {
  const n = notice({ stage: "tender", deadline: null });
  assert.equal(keepDeadline(n, NOW), true);
});

// --- Rule 4: polling and research ---------------------------------------------

test("polling: a polling survey notice is dropped (by its wording)", () => {
  const n = notice({
    title: "Public attitudes survey on health services",
    description: "Fieldwork for an opinion polling exercise",
    cpvCodes: ["85100000"],
  });
  assert.equal(keepNotPolling(n), false);
});

test("polling: a notice with a polling CPV code is dropped, even with no polling words", () => {
  const n = notice({ title: "Survey of residents", cpvCodes: ["79320000"] });
  assert.equal(keepNotPolling(n), false);
});

test("polling: an exclusion term beats a topic match", () => {
  // "digital health" is an include keyword, but "market research" is an exclusion.
  const n = notice({ title: "Market research on digital health" });
  assert.equal(keepNotPolling(n), false);
  assert.equal(keepOnTopic(n), true);
});

test("polling: an ordinary digital health notice is not dropped", () => {
  assert.equal(keepNotPolling(notice({ title: "Health data platform", cpvCodes: ["72000000"] })), true);
});

test("social care: a social care notice is dropped as out of scope", () => {
  const n = notice({ title: "Digital health services for social care", cpvCodes: ["48000000"] });
  assert.equal(keepNotPolling(n), false);
});

test("health: a plain health or social care notice is not on topic", () => {
  // The word "health" alone is no longer a keyword, and the health CPV codes are gone.
  assert.equal(keepOnTopic(notice({ title: "Health and social care services", cpvCodes: ["85100000"] })), false);
});

// --- Rule 5: on topic ------------------------------------------------------------

test("topic: a keyword match is kept", () => {
  assert.equal(keepOnTopic(notice({ title: "Net zero delivery partner" })), true);
});

test("topic: an include CPV code is kept, even with no keyword", () => {
  assert.equal(keepOnTopic(notice({ title: "Software licences", cpvCodes: ["48000000"] })), true);
});

test("police and justice: a sector word with a qualifier is kept", () => {
  assert.equal(keepOnTopic(notice({ title: "Digital policing platform" })), true);
  assert.equal(keepOnTopic(notice({ title: "Policing and data sharing service" })), true);
  assert.equal(keepOnTopic(notice({ title: "Justice operating model review" })), true);
  assert.equal(keepOnTopic(notice({ title: "Criminal justice strategy consultancy" })), true);
});

test("police and justice: a qualifier far away from the sector word does not count", () => {
  // "strategy" is a qualifier, but it is more than six words away from "police".
  const far = "police custody cell maintenance " + "word ".repeat(10) + "strategy";
  assert.equal(keepOnTopic(notice({ title: far })), false);
});

test("police and justice: a sector word alone is dropped", () => {
  // The Overt Fleet notice: policing is mentioned, but the work is vehicle repair.
  const n = notice({ title: "Overt Fleet Vehicle Collision Repair Services", description: "fleet for policing" });
  assert.equal(keepOnTopic(n), false);
  assert.equal(keepOnTopic(notice({ title: "Police custody cell maintenance" })), false);
});

test("topic: a notice with no keyword and no include code is dropped", () => {
  assert.equal(keepOnTopic(notice({ title: "Waste collection", cpvCodes: ["90511000"] })), false);
});

// --- Rule 6: value -----------------------------------------------------------------

test("value: a notice with no stated value is kept and not flagged", () => {
  const n = notice({ value: null });
  assert.equal(isLowPriority(n), false);
  assert.equal(keepOnTopic(notice({ title: "Digital health services", value: null })), true);
});

test("value: under £5m is flagged low priority", () => {
  assert.equal(isLowPriority(notice({ value: 3_000_000 })), true);
});

test("value: £5m or more is not flagged", () => {
  assert.equal(isLowPriority(notice({ value: 5_000_000 })), false);
  assert.equal(isLowPriority(notice({ value: 27_000_000 })), false);
});

// --- Whole pre-filter, with counts ------------------------------------------------

test("runPreFilter: each rule's removals are counted, and the rest are kept", () => {
  const notices: Notice[] = [
    notice({ id: "keep-1", title: "Artificial intelligence services", value: 27_000_000 }),
    notice({ id: "keep-2", title: "Pipeline digital health review", stage: "pipeline", deadline: null, value: null }),
    notice({ id: "award-1", title: "Health contract", stage: "award" }),
    notice({ id: "goods-1", title: "Health equipment", procurementCategory: "goods" }),
    notice({ id: "soon-1", title: "Health service", deadline: "2026-11-08T12:00:00Z" }),
    notice({ id: "poll-1", title: "Opinion polling on health", cpvCodes: ["79320000"] }),
    notice({ id: "off-1", title: "Waste collection", cpvCodes: ["90511000"] }),
    notice({ id: "low-1", title: "Health data pilot", value: 400_000 }),
  ];

  const result = runPreFilter(notices, NOW);
  const keptIds = result.kept.map((n) => n.id).sort();

  assert.deepEqual(keptIds, ["keep-1", "keep-2", "low-1"]);
  assert.equal(result.counts.removedByStage, 1);
  assert.equal(result.counts.removedByCategory, 1);
  assert.equal(result.counts.removedByDeadline, 1);
  assert.equal(result.counts.removedAsPollingOrResearch, 1);
  assert.equal(result.counts.removedNotOnTopic, 1);
  assert.equal(result.counts.removedDuplicates, 0);
  assert.equal(result.counts.kept, 3);
  assert.equal(result.counts.lowPriorityFlagged, 1);
});

test("runPreFilter: an award does not hide an open tender with the same title and buyer", () => {
  const notices: Notice[] = [
    notice({ id: "award-1", title: "Digital health contract", buyer: "NHS Trust", stage: "award" }),
    notice({ id: "tender-1", title: "Digital health contract", buyer: "NHS Trust", stage: "tender" }),
  ];
  const result = runPreFilter(notices, NOW);
  assert.deepEqual(result.kept.map((n) => n.id), ["tender-1"]);
  assert.equal(result.counts.removedByStage, 1);
});
