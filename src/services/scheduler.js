// Timer scheduler for temporary mutes/bans. Restores pending timers from the database on boot.
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { getActiveTempCases, getCaseById, setCaseStatus } from '../db.js';
import { buildAuditEmbed } from '../utils/embeds.js';
import { sendModLog } from './log.js';

const MAX_TIMEOUT = 2 ** 31 - 1; // setTimeout limit (~24.8 days)
let client = null;
const timers = new Map(); // caseId -> Timeout

export function initScheduler(c) {
  client = c;
  const rows = getActiveTempCases();
  for (const row of rows) arm(row.id);
  if (rows.length) console.log(`[scheduler] Restored ${rows.length} temporary case timer(s).`);
}

export const scheduleCase = (caseId) => arm(caseId);

export function cancelCaseTimer(caseId) {
  const timer = timers.get(caseId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(caseId);
  }
}

function arm(caseId) {
  cancelCaseTimer(caseId);
  const row = getCaseById(caseId);
  if (!row || row.status !== 'active' || !row.expires_at || !['mute', 'ban'].includes(row.type)) return;

  const delay = row.expires_at - Date.now();
  const wait = Math.max(Math.min(delay, MAX_TIMEOUT), 1);
  const timer = setTimeout(() => {
    timers.delete(caseId);
    if (delay > MAX_TIMEOUT) {
      arm(caseId); // re-arm for very long durations
      return;
    }
    handleExpiry(caseId).catch((err) =>
      console.error(`[scheduler] Failed to process expiry of case #${row.case_number}:`, err),
    );
  }, wait);
  timers.set(caseId, timer);
}

async function handleExpiry(caseId) {
  const row = getCaseById(caseId);
  if (!row || row.status !== 'active') return;

  const guild = client?.guilds?.cache?.get(row.guild_id);
  if (!guild) {
    setCaseStatus(caseId, 'expired');
    return;
  }
  let note = '';

  if (row.type === 'mute') {
    const member = await guild.members.fetch(row.user_id).catch(() => null);
    if (member) {
      if (config.muteRoleId && member.roles.cache.has(config.muteRoleId)) {
        await member.roles.remove(config.muteRoleId, `Mute expired - Case #${row.case_number}`).catch((err) => {
          note = ` (failed to remove role: ${err.message})`;
        });
      }
    } else {
      note = ' (member left the server)';
    }
    setCaseStatus(caseId, 'expired');
    await sendModLog(
      guild,
      buildAuditEmbed({
        title: `Mute Expired - Case #${row.case_number}`,
        description: `Automatically removed the mute for <@${row.user_id}>.${note}`,
        color: COLORS.gray,
      }),
    );
    return;
  }

  if (row.type === 'ban') {
    try {
      await guild.bans.remove(row.user_id, `Ban expired - Case #${row.case_number}`);
    } catch (err) {
      note = ` (${err.message})`;
    }
    setCaseStatus(caseId, 'expired');
    await sendModLog(
      guild,
      buildAuditEmbed({
        title: `Ban Expired - Case #${row.case_number}`,
        description: `Automatically unbanned <@${row.user_id}>.${note}`,
        color: COLORS.gray,
      }),
    );
  }
}
