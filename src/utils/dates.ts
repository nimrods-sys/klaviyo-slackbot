const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a strict YYYY-MM-DD string. Returns null for malformed or impossible dates (e.g. 2026-02-30). */
export function parseIsoDate(input: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input) return null;
  return input;
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The same weekday one year earlier: 52 weeks (364 days) back.
 * e.g. Thu 2026-11-19 -> Thu 2025-11-20.
 */
export function sameWeekdayLastYear(date: string): string {
  return addDays(date, -364);
}

/** Current date (YYYY-MM-DD) and time (HH:MM:SS) in the given IANA timezone. */
export function nowInTimezone(timeZone: string, now: Date = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

/** UTC offset (e.g. "-05:00", "+02:00") of a timezone at a given instant. */
function offsetAt(timeZone: string, instant: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : '+00:00';
}

function offsetToMs(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return sign * (h * 60 + m) * 60 * 1000;
}

/**
 * Turn a local wall-clock date+time in `timeZone` into an ISO 8601 timestamp with explicit offset,
 * e.g. ("2026-11-19", "00:00:00", "America/New_York") -> "2026-11-19T00:00:00-05:00".
 */
export function localToIso(date: string, time: string, timeZone: string): string {
  const naiveUtc = new Date(`${date}T${time}Z`).getTime();
  // Two passes so we land on the right side of a DST transition.
  let offset = offsetAt(timeZone, new Date(naiveUtc));
  offset = offsetAt(timeZone, new Date(naiveUtc - offsetToMs(offset)));
  return `${date}T${time}${offset}`;
}

/** e.g. "Thu, Nov 19, 2026" */
export function formatPrettyDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}
