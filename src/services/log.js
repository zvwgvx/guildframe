import { config } from '../config.js';
import { buildCaseEmbed } from '../utils/embeds.js';

// Sends an embed to the configured mod log channel. Never throws; returns null when skipped.
export async function sendModLog(guild, embed, { content = null } = {}) {
  try {
    if (!config.modLogChannelId) return null;
    const channel =
      guild.channels.cache.get(config.modLogChannelId) ??
      (await guild.channels.fetch(config.modLogChannelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return null;
    return await channel.send({ content, embeds: [embed] });
  } catch (err) {
    console.error('[log] Failed to send mod log:', err.message);
    return null;
  }
}

// Logs a case to the mod log channel.
export async function logCase(guild, caseRow, { clientId = null } = {}) {
  return sendModLog(guild, buildCaseEmbed(caseRow, { clientId }));
}
