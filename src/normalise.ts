// Turns a notice from either service into our common shape, then removes
// duplicates and award notices.

import type { Classification, Notice, Release, Source, Tender } from "./types.ts";

// Tags that mean a contract award (the contract has been given to a supplier).
const AWARD_TAGS = ["award", "contract", "awardUpdate", "contractUpdate"];

// Work out the stage from the release's tag list.
export function stageOf(tags: string[] = []): string {
  if (tags.some((t) => AWARD_TAGS.includes(t))) return "award";
  if (tags.some((t) => t === "tender" || t === "tenderUpdate")) return "tender";
  if (tags.some((t) => t === "planning" || t === "planningUpdate")) return "pipeline";
  return tags.join(",") || "unknown";
}

// Collect every CPV code (the standard codes for what is being bought) on a notice, once each.
function cpvCodesOf(tender: Tender): string[] {
  const found = new Set<string>();
  const add = (c?: Classification) => {
    if (c?.id && (!c.scheme || c.scheme === "CPV")) found.add(c.id);
  };
  add(tender.classification);
  for (const item of tender.items ?? []) {
    add(item.classification);
    for (const extra of item.additionalClassifications ?? []) add(extra);
  }
  return [...found];
}

// Turn one notice from either service into our common shape.
export function normaliseRelease(release: Release, source: Source): Notice {
  const tender: Tender = release.tender ?? {};
  const buyerParty = release.parties?.find((p) => p.roles?.includes("buyer"));

  // Region: the buyer's address if it has one, otherwise the first delivery region on an item.
  const deliveryRegion = (tender.items ?? [])
    .flatMap((item) => item.deliveryAddresses ?? [])
    .find((address) => address.region)?.region;

  // Link to the notice: the first document's link, or for Find a Tender the notice page built from its ID.
  const documentUrl = tender.documents?.find((d) => d.url)?.url;
  const fallbackUrl =
    source === "find-tender" ? `https://www.find-tender.service.gov.uk/Notice/${release.id}` : null;

  // Published date: the first document's publish date, otherwise the release date.
  const publishedDate = tender.documents?.find((d) => d.datePublished)?.datePublished ?? release.date ?? null;

  return {
    id: release.id,
    source,
    ocid: release.ocid ?? null,
    title: tender.title ?? "(no title)",
    description: tender.description ?? null,
    buyer: release.buyer?.name ?? buyerParty?.name ?? null,
    value: tender.value?.amount ?? null,
    currency: tender.value?.currency ?? null,
    deadline: tender.tenderPeriod?.endDate ?? null,
    stage: stageOf(release.tag),
    cpvCodes: cpvCodesOf(tender),
    procurementCategory: tender.mainProcurementCategory ?? null,
    region: buyerParty?.address?.region ?? deliveryRegion ?? null,
    url: documentUrl ?? fallbackUrl,
    publishedDate,
  };
}

// Make text comparable: lower case, and single spaces with no spaces at the ends.
function comparable(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// Remove duplicates. Two rules:
// 1. The same notice ID appears more than once (for example, several versions of one notice). Keep the newest.
// 2. Same title and same buyer, from either service. Keep the newest.
// The newest copy is kept first, so older copies are the ones dropped.
export function removeDuplicates(notices: Notice[]): Notice[] {
  const newestFirst = [...notices].sort((a, b) => (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""));
  const seenIds = new Set<string>();
  const seenTitleBuyer = new Set<string>();
  const kept: Notice[] = [];

  for (const notice of newestFirst) {
    if (seenIds.has(notice.id)) continue;
    const titleBuyerKey = notice.buyer ? `${comparable(notice.title)}|${comparable(notice.buyer)}` : null;
    if (titleBuyerKey && seenTitleBuyer.has(titleBuyerKey)) continue;

    seenIds.add(notice.id);
    if (titleBuyerKey) seenTitleBuyer.add(titleBuyerKey);
    kept.push(notice);
  }
  return kept;
}
