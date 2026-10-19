// Scheduler cho temp mute / temp ban: hẹn giờ từ DB, khôi phục lại sau khi bot restart.
import { COLORS } from '../constants.js';
import { deactivateCase, getActiveTempCases, getCaseById, getGuildConfig } from '../db.js';
import { buildAuditEmbed } from '../utils/embeds.js';
import { sendModLog } from './log.js';

const MAX_TIMEOUT = 2 ** 31 - 1; // giới hạn của setTimeout (~24.8 ngày)
let client = null;
const timers = new Map(); // caseId -> Timeout

export function initScheduler(c) {
  client = c;
  const rows = getActiveTempCases();
  for (const row of rows) arm(row.id);
  if (rows.length) console.log(`[scheduler] Đã nạp ${rows.length} timer (temp mute/ban).`);
}

export const scheduleCase = (caseId) => arm(caseId);

export function cancelCaseTimer(caseId) {
  const t = timers.get(caseId);
  if (t) {
    clearTimeout(t);
    timers.delete(caseId);
  }
}

function arm(caseId) {
  cancelCaseTimer(caseId);
  const row = getCaseById(caseId);
  if (!row || !row.active || !row.expires_at || !['mute', 'ban'].includes(row.type)) return;

  const delay = row.expires_at - Date.now();
  const wait = Math.max(Math.min(delay, MAX_TIMEOUT), 1);
  const timer = setTimeout(() => {
    timers.delete(caseId);
    if (delay > MAX_TIMEOUT) {
      arm(caseId); // hẹn lại nếu còn xa hơn giới hạn setTimeout
      return;
    }
    handleExpiry(caseId).catch((err) =>
      console.error(`[scheduler] Lỗi xử lý hết hạn case #${row.case_number}:`, err),
    );
  }, wait);
  timers.set(caseId, timer);
}

async function handleExpiry(caseId) {
  const row = getCaseById(caseId);
  if (!row || !row.active) return;

  const guild = client?.guilds?.cache?.get(row.guild_id);
  if (!guild) {
    deactivateCase(caseId);
    return;
  }
  const cfg = getGuildConfig(row.guild_id);
  let note = '';

  if (row.type === 'mute') {
    const member = await guild.members.fetch(row.user_id).catch(() => null);
    if (member) {
      if (cfg.mute_role_id && member.roles.cache.has(cfg.mute_role_id)) {
        await member.roles
          .remove(cfg.mute_role_id, `Hết hạn mute — Case #${row.case_number}`)
          .catch((err) => {
            note = ` (không gỡ được role: ${err.message})`;
          });
      }
    } else {
      note = ' (thành viên đã rời server)';
    }
    deactivateCase(caseId);
    await sendModLog(
      guild,
      buildAuditEmbed({
        title: `⌛ Hết hạn mute — Case #${row.case_number}`,
        description: `Đã tự động gỡ mute cho <@${row.user_id}>.${note}`,
        color: COLORS.gray,
      }),
    );
    return;
  }

  if (row.type === 'ban') {
    try {
      await guild.bans.remove(row.user_id, `Hết hạn temp ban — Case #${row.case_number}`);
    } catch (err) {
      note = ` (${err.message})`;
    }
    deactivateCase(caseId);
    await sendModLog(
      guild,
      buildAuditEmbed({
        title: `⌛ Hết hạn ban — Case #${row.case_number}`,
        description: `Đã tự động unban <@${row.user_id}>.${note}`,
        color: COLORS.gray,
      }),
    );
  }
}
