// Works out the date window to fetch, from the DAYS_BACK setting.

// Read DAYS_BACK from the Worker's settings. If it is missing, use 2.
export function daysBackFrom(env: { DAYS_BACK?: string }): number {
  const raw = env.DAYS_BACK ?? "2";
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`DAYS_BACK must be a whole number of 0 or more, but it is "${raw}"`);
  }
  return days;
}

// Format a date as YYYY-MM-DD (UTC).
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Format a date as YYYY-MM-DDTHH:MM:SS (no time zone letter), which the APIs accept.
function isoNoZone(date: Date): string {
  return date.toISOString().slice(0, 19);
}

// The window runs from midnight (UTC) on the day DAYS_BACK days ago, up to now.
// Find a Tender takes full date-times. Contracts Finder takes dates, and its end date
// is the day after today so that all of today is included.
export function windowFor(now: Date, daysBack: number) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = new Date(Date.UTC(y, m, d - daysBack));
  const tomorrow = new Date(Date.UTC(y, m, d + 1));
  return {
    fromIso: isoNoZone(start),
    toIso: isoNoZone(now),
    fromDate: ymd(start),
    toDate: ymd(tomorrow),
  };
}
