import { getGuildConfig } from '../db.js';
import { buildCaseEmbed } from '../utils/embeds.js';

// Gửi embed tới kênh mod log đã cấu hình. Không throw nếu chưa cấu hình / gửi lỗi.
export async function sendModLog(guild, embed, { channelId = null } = {}) {
  try {
    const cfg = getGuildConfig(guild.id);
    const targetId = channelId || cfg.log_channel_id;
    if (!targetId) return null;

    const channel =
      guild.channels.cache.get(targetId) ?? (await guild.channels.fetch(targetId).catch(() => null));
    if (!channel || !channel.isTextBased()) return null;

    return await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[log] Không gửi được mod log:', err.message);
    return null;
  }
}

// Log chi tiết 1 case.
export async function logCase(guild, caseRow, { clientId = null } = {}) {
  return sendModLog(guild, buildCaseEmbed(caseRow, { clientId }));
}
