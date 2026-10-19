// Hằng số dùng chung toàn bot.

export const COLORS = {
  warn: 0xfee75c,
  mute: 0xe67e22,
  unmute: 0x57f287,
  kick: 0xf97316,
  ban: 0xed4245,
  unban: 0x57f287,
  note: 0x5865f2,
  info: 0x5865f2,
  success: 0x57f287,
  error: 0xed4245,
  audit: 0x9b59b6,
  gray: 0x95a5a6,
};

// Metadata hiển thị cho từng loại case.
export const TYPE_META = {
  warn: { label: 'Cảnh cáo', emoji: '⚠️', color: COLORS.warn },
  mute: { label: 'Mute', emoji: '🔇', color: COLORS.mute },
  unmute: { label: 'Unmute', emoji: '🔊', color: COLORS.unmute },
  kick: { label: 'Kick', emoji: '👢', color: COLORS.kick },
  ban: { label: 'Ban', emoji: '🔨', color: COLORS.ban },
  unban: { label: 'Unban', emoji: '♻️', color: COLORS.unban },
  note: { label: 'Ghi chú', emoji: '📝', color: COLORS.note },
};

// Các loại case được tính vào "điểm vi phạm" (offence count).
export const OFFENCE_TYPES = ['warn', 'mute', 'kick', 'ban'];

export const MAX_MUTE_MS = 90 * 24 * 60 * 60 * 1000; // 90 ngày
export const MAX_BAN_MS = 365 * 24 * 60 * 60 * 1000; // 365 ngày

export const HISTORY_PAGE_SIZE = 5;
export const WARNINGS_PAGE_SIZE = 5;
