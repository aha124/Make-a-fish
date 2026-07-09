// Server-authoritative time gate.
//
// The 11:11 window is decided on the server using the server's own trusted UTC
// clock, projected into the visitor's timezone. We never trust the browser
// clock to decide open/closed, because that is trivially spoofable. The client
// only uses serverNow to render a countdown, and even that is anchored to the
// server, not the local clock.

export type WindowState = {
  open: boolean;
  // Epoch milliseconds from the server's trusted clock.
  serverNow: number;
  // Epoch of the upcoming 11:12:00 boundary when open, otherwise null.
  windowEnd: number | null;
  // The IANA timezone we decided against, for display/debugging.
  timezone: string;
};

// Extract the wall-clock parts of `date` as seen in `timeZone`.
function partsInZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = parseInt(part.value, 10);
  }
  // Intl renders 24:xx for midnight in hour12:false; normalize to 0.
  if (map.hour === 24) map.hour = 0;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

// The offset (ms) of `timeZone` from UTC at the given instant.
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  // Interpret the local wall-clock parts as if they were UTC, then diff.
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round the source date down to whole seconds so the diff is stable.
  const actual = Math.floor(date.getTime() / 1000) * 1000;
  return asUtc - actual;
}

// Compute the window state for a given timezone using the server clock.
// `now` is injectable for testing; defaults to the real server time.
export function computeWindow(timezone: string, now: Date = new Date()): WindowState {
  let tz = timezone;
  let parts;
  try {
    parts = partsInZone(now, tz);
  } catch {
    // Invalid/unknown timezone string: fall back to UTC so we fail closed
    // rather than throwing.
    tz = "UTC";
    parts = partsInZone(now, tz);
  }

  // Open during both 11:11 am (hour 11) and 11:11 pm (hour 23), for the full
  // minute 11:11:00 through 11:11:59 local time.
  const open = (parts.hour === 11 || parts.hour === 23) && parts.minute === 11;

  let windowEnd: number | null = null;
  if (open) {
    // The upcoming 11:12:00 local boundary. Build the UTC instant that maps to
    // 11:12:00 wall-clock in this zone by subtracting the zone offset.
    const offset = zoneOffsetMs(now, tz);
    const boundaryLocalAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      12,
      0
    );
    windowEnd = boundaryLocalAsUtc - offset;
  }

  return {
    open,
    serverNow: now.getTime(),
    windowEnd,
    timezone: tz,
  };
}
