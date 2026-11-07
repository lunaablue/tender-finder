// The pre-filter. It runs in code, before any AI call, and removes notices that
// do not match your criteria. Each rule is a small function that answers
// "keep this notice?" (true) or "drop it?" (false).

import { CRITERIA } from "./criteria.ts";
import { removeDuplicates } from "./normalise.ts";
import type { Notice } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// Make text easy to compare: lower case, a hyphen counts as a space,
// and runs of spaces become one space. So "Dual-Use" becomes "dual use".
export function normaliseForMatch(text: string): string {
  return text.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

// The title and description of a notice, joined and made easy to compare.
function textOf(notice: Notice): string {
  return normaliseForMatch(`${notice.title} ${notice.description ?? ""}`);
}

// Rule 1: keep only open tenders and pipeline notices. Awards are dropped.
export function keepStage(notice: Notice): boolean {
  return CRITERIA.allowedStages.includes(notice.stage);
}

// Rule 2: keep services only. Goods, works, and notices with no category are dropped.
export function keepCategory(notice: Notice): boolean {
  return notice.procurementCategory === CRITERIA.allowedCategory;
}

// Rule 3: drop open tenders closing in fewer than 3 days.
// Notices with no deadline (such as pipeline notices) are kept.
export function keepDeadline(notice: Notice, now: Date): boolean {
  if (notice.stage !== "tender" || !notice.deadline) return true;
  const closesInMs = Date.parse(notice.deadline) - now.getTime();
  return closesInMs >= CRITERIA.minDaysToClose * DAY_MS;
}

// Rule 4: drop notices about polling or research. This is true when the title or
// description has an exclusion term, or the notice has a polling or research CPV code.
export function isPollingOrResearch(notice: Notice): boolean {
  const text = textOf(notice);
  const hasTerm = CRITERIA.excludeTerms.some((term) => text.includes(normaliseForMatch(term)));
  const hasCode = notice.cpvCodes.some((code) => CRITERIA.pollingCpvCodes.includes(code));
  return hasTerm || hasCode;
}
export function keepNotPolling(notice: Notice): boolean {
  return !isPollingOrResearch(notice);
}

// How many words either side of a police or justice word to look for a qualifier.
const QUALIFIER_WINDOW_WORDS = 6;

// True if a sector word (such as "policing") has a qualifier word (such as "digital")
// within a few words of it. Checking the whole text was too loose, because words like
// "strategy" and "digital" appear in ordinary procurement wording.
export function hasSectorWithQualifier(text: string): boolean {
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  const sectors = CRITERIA.sectorWords.map(normaliseForMatch);
  const qualifiers = CRITERIA.qualifierWords.map(normaliseForMatch);
  for (let i = 0; i < words.length; i++) {
    if (!sectors.some((s) => words[i].startsWith(s))) continue;
    const nearby = words.slice(Math.max(0, i - QUALIFIER_WINDOW_WORDS), i + QUALIFIER_WINDOW_WORDS + 1).join(" ");
    if (qualifiers.some((q) => nearby.includes(q))) return true;
  }
  return false;
}

// Rule 5: keep a notice on topic if any of these is true:
// - its title or description has an include keyword,
// - it has an include CPV code, or
// - a police or justice word has a qualifier word close to it (for example "digital policing").
export function isOnTopic(notice: Notice): boolean {
  const text = textOf(notice);
  const hasKeyword = CRITERIA.includeKeywords.some((keyword) => text.includes(normaliseForMatch(keyword)));
  const hasCode = notice.cpvCodes.some((code) => CRITERIA.includeCpvCodes.includes(code));
  return hasKeyword || hasCode || hasSectorWithQualifier(text);
}
export function keepOnTopic(notice: Notice): boolean {
  return isOnTopic(notice);
}

// Rule 6: value. This rule never removes a notice. It only flags notices with a
// stated value under £5m as low priority. Notices with no value are kept, not flagged.
export function isLowPriority(notice: Notice): boolean {
  return notice.value !== null && notice.value < CRITERIA.lowPriorityBelowGbp;
}

export interface PreFilterResult {
  kept: Notice[];
  counts: {
    input: number;
    removedByStage: number;
    removedDuplicates: number;
    removedByCategory: number;
    removedByDeadline: number;
    removedAsPollingOrResearch: number;
    removedNotOnTopic: number;
    kept: number;
    lowPriorityFlagged: number;
  };
}

// Run every rule in order. A notice removed by one rule is not counted again by a later rule.
// Duplicates are removed after the stage rule, so an award never hides an open tender.
export function runPreFilter(notices: Notice[], now: Date): PreFilterResult {
  let current = notices;
  const step = (keep: (n: Notice) => boolean): number => {
    const before = current.length;
    current = current.filter(keep);
    return before - current.length;
  };

  const removedByStage = step(keepStage);
  const beforeDedupe = current.length;
  current = removeDuplicates(current);
  const removedDuplicates = beforeDedupe - current.length;
  const removedByCategory = step(keepCategory);
  const removedByDeadline = step((n) => keepDeadline(n, now));
  const removedAsPollingOrResearch = step(keepNotPolling);
  const removedNotOnTopic = step(keepOnTopic);

  return {
    kept: current,
    counts: {
      input: notices.length,
      removedByStage,
      removedDuplicates,
      removedByCategory,
      removedByDeadline,
      removedAsPollingOrResearch,
      removedNotOnTopic,
      kept: current.length,
      lowPriorityFlagged: current.filter(isLowPriority).length,
    },
  };
}
