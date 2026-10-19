// Duration parsing/formatting.
// Accepted units: s (seconds), m (minutes), h (hours), d (days), w (weeks), e.g. "5m", "3d", "1d12h".
// "perm"/"permanent"/"forever" (or empty input) means permanent -> null. A bare number means minutes.
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

const PERMANENT_WORDS = new Set(['perm', 'permanent', 'forever']);

/**
 * @returns {number|null} milliseconds, or null for permanent/no duration
 * @throws {Error} when the input cannot be parsed
 */
export function parseDuration(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (PERMANENT_WORDS.has(raw)) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * UNIT_MS.m; // bare number = minutes

  const re = /(\d+)\s*(w|d|h|m|s)/g;
  let total = 0;
  let matched = false;
  let m;
  while ((m = re.exec(raw)) !== null) {
    matched = true;
    total += Number(m[1]) * UNIT_MS[m[2]];
  }
  if (!matched || total <= 0) {
    throw new Error(`Invalid duration "${input}". Valid examples: 30s, 5m, 2h, 3d, 1d12h, perm.`);
  }
  return total;
}

// Long form: "1 day 12 hours".
export function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Permanent';
  const units = [
    ['w', 'week', UNIT_MS.w],
    ['d', 'day', UNIT_MS.d],
    ['h', 'hour', UNIT_MS.h],
    ['m', 'minute', UNIT_MS.m],
    ['s', 'second', UNIT_MS.s],
  ];
  const parts = [];
  let rest = ms;
  for (const [, label, size] of units) {
    const value = Math.floor(rest / size);
    if (value > 0) {
      parts.push(`${value} ${label}${value > 1 ? 's' : ''}`);
      rest -= value * size;
    }
  }
  return parts.join(' ') || '0 seconds';
}

// Compact form used in action embeds: "14d", "5m", "1d12h". Permanent -> null.
export function formatDurationCompact(ms) {
  if (!ms || ms <= 0) return null;
  const units = [
    ['w', UNIT_MS.w],
    ['d', UNIT_MS.d],
    ['h', UNIT_MS.h],
    ['m', UNIT_MS.m],
    ['s', UNIT_MS.s],
  ];
  const parts = [];
  let rest = ms;
  for (const [label, size] of units) {
    const value = Math.floor(rest / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      rest -= value * size;
    }
  }
  return parts.join('') || '0s';
}
