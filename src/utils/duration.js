// Parse/format khoảng thời gian dạng "1d12h", "30m", "2h", "90" (số trần = phút).
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

const PERMANENT_WORDS = new Set(['perm', 'permanent', 'forever', 'vinhvien', 'vĩnh viễn', 'vô hạn']);

/**
 * @returns {number|null} số mili-giây, hoặc null nếu không nhập / là "vĩnh viễn"
 * @throws {Error} nếu chuỗi không hợp lệ
 */
export function parseDuration(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (PERMANENT_WORDS.has(raw)) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * UNIT_MS.m; // số trần = phút

  const re = /(\d+)\s*(w|d|h|m|s)/g;
  let total = 0;
  let matched = false;
  let m;
  while ((m = re.exec(raw)) !== null) {
    matched = true;
    total += Number(m[1]) * UNIT_MS[m[2]];
  }
  if (!matched || total <= 0) {
    throw new Error(`Không hiểu khoảng thời gian "${input}". Ví dụ hợp lệ: 30m, 1h, 7d, 1d12h.`);
  }
  return total;
}

export function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Vĩnh viễn';
  const units = [
    ['w', 'tuần', UNIT_MS.w],
    ['d', 'ngày', UNIT_MS.d],
    ['h', 'giờ', UNIT_MS.h],
    ['m', 'phút', UNIT_MS.m],
    ['s', 'giây', UNIT_MS.s],
  ];
  const parts = [];
  let rest = ms;
  for (const [, label, size] of units) {
    const value = Math.floor(rest / size);
    if (value > 0) {
      parts.push(`${value} ${label}`);
      rest -= value * size;
    }
  }
  return parts.join(' ') || '0 giây';
}
