const DAY_MS = 24 * 60 * 60 * 1000;
// The store reports in India Standard Time (UTC+05:30, no daylight saving).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * DAY_MS);

/** Calendar day in IST as YYYY-MM-DD. */
export const istDay = (date) => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Calendar month in IST as YYYY-MM. */
export const istMonth = (date) => istDay(date).slice(0, 7);

/** Start (UTC instant) of the IST day that is `n` days before today. */
export function istDayStart(n = 0, from = new Date()) {
  const day = istDay(daysAgo(n, from));
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
}

/** Add `n` months to a YYYY-MM key. */
export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
