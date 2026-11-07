// Your search criteria, in one place. Taken from PLAN.md ("Search criteria").
// To change what the tool keeps, edit this file and nothing else.
//
// Matching ignores capital letters, and treats a hyphen as a space,
// so "dual-use" and "dual use" are the same.

export const CRITERIA = {
  // A notice is kept if its title or description contains any of these words.
  includeKeywords: [
    "digital and data",
    "digital transformation",
    "digital adoption",
    "technological adoption",
    "ai adoption",
    "artificial intelligence",
    "quantum",
    "economic growth",
    "industrial strategy",
    "economic resilience",
    "supply chain resilience",
    "critical inputs",
    "life sciences",
    "digital health",
    "health data",
    "procurement strategy",
    "energy security",
    "energy resilience",
    "net zero",
    "dual use",
    "nuclear estate",
    "critical national infrastructure",
    "consultancy",
  ],

  // Police and justice work is kept only when it also has a qualifier word, so a passing
  // mention is not enough. A notice is on topic if it has a sector word AND a qualifier word.
  // For example "digital policing", "policing and data", "justice operating model", or
  // "criminal justice strategy consultancy" are kept, but "vehicle repair for the police" is not.
  sectorWords: ["policing", "police", "justice"],
  qualifierWords: [
    "digital",
    "data",
    "operating model",
    "organisational",
    "organizational",
    "transformation",
    "strategy",
    "strategic",
    "business case",
    "change programme",
    "consultancy",
    "consulting",
  ],

  // A notice is kept on topic if it has any of these CPV codes (standard codes for what is bought).
  // Taken from the codes we saw on matching notices in step 2. Edit as you learn more.
  // Health and social care codes are left out on purpose. Keep only digital and IT codes here.
  includeCpvCodes: [
    "48000000", // software packages and information systems
    "72000000", // IT services
    "72200000", // software programming and consultancy services
  ],

  // A notice is dropped if its title or description contains any of these.
  excludeTerms: [
    "opinion polling",
    "public attitudes survey",
    "market research",
    "social research",
    "survey fieldwork",
    "focus groups",
    "omnibus survey",
    "social care", // health and social care is out of scope
  ],

  // A notice is dropped if it has any of these CPV codes (polling and research work).
  // These are standard codes in the 79300000 range. Check them against the official CPV list.
  pollingCpvCodes: [
    "79300000", // market and economic research; polling and statistics
    "79310000", // market research services
    "79311000", // data collection services
    "79320000", // polling services
    "79330000", // survey services
  ],

  // Notices with a stated value under this amount (GBP, before tax) are flagged low priority.
  // Notices with no stated value are kept and are not flagged.
  lowPriorityBelowGbp: 5_000_000,

  // Open tenders closing in fewer than this many days are dropped.
  // Pipeline notices have no bid deadline, so they are never dropped for this.
  minDaysToClose: 3,

  // Only these stages are kept: open tenders (tender) and early notices (pipeline).
  // Contract awards and anything else (cancellations, amendments and so on) are dropped.
  allowedStages: ["tender", "pipeline"],

  // Only this procurement category is kept. Goods, works and notices with no category are dropped.
  allowedCategory: "services",
};
