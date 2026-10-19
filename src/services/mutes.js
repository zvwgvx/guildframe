// Nghiệp vụ mute: quản lý role Muted + overwrite từng kênh, gán/gỡ role, tạo case, hẹn giờ.
import { ChannelType } from 'discord.js';
import { config } from '../config.js';
import { createCase, deactivateCase, deactivateCases, getActiveCases, getGuildConfig, hideCase, updateGuildConfig } from '../db.js';
import { buildCaseEmbed } from '../utils/embeds.js';
import { logCase } from './log.js';
import { cancelCaseTimer, scheduleCase } from './scheduler.js';

// Tìm hoặc tạo role Muted. Trả về role (hoặc null nếu createIfMissing = false).
export async function ensureMuteRole(guild, { createIfMissing = true, reason = 'Thiết lập role mute' } = {}) {
  const cfg = getGuildConfig(guild.id);
  let role = cfg.mute_role_id ? await guild.roles.fetch(cfg.mute_role_id).catch(() => null) : null;

  if (!role) {
    role =
      guild.roles.cache.find(
        (r) => !r.managed && r.name.toLowerCase() === config.muteRoleName.toLowerCase(),
      ) ?? null;
  }
  if (!role && !createIfMissing) return null;
  if (!role) {
    role = await guild.roles.create({
      name: config.muteRoleName,
      color: 0x95a5a6,
      hoist: false,
      mentionable: false,
      permissions: [],
      reason,
    });
  }
  if (cfg.mute_role_id !== role.id) updateGuildConfig(guild.id, { mute_role_id: role.id });
  return role;
}

// Overwrite cho role mute trên 1 kênh cụ thể.
export function muteOverwriteOptions(channel) {
  if (channel.isVoiceBased()) return { Speak: false, Stream: false };
  return {
    SendMessages: false,
    SendMessagesInThreads: false,
    AddReactions: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    Speak: false,
  };
}

export async function applyMuteOverwrite(channel, role, reason = 'Thiết lập miễn nhiễm kênh cho role mute') {
  await channel.permissionOverwrites.edit(role, muteOverwriteOptions(channel), { reason });
}

// Áp overwrite cho toàn bộ kênh hiện có (bỏ qua category). Trả về thống kê.
export async function applyMuteOverwritesAll(guild, role) {
  let ok = 0;
  let failed = 0;
  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildCategory) continue;
    try {
      await applyMuteOverwrite(channel, role);
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

// Áp mute: gán role + tạo case + log + hẹn giờ (nếu có thời hạn).
export async function applyMute(guild, member, { moderatorId, reason = null, durationMs = null, clientId = null }) {
  const role = await ensureMuteRole(guild);
  const caseRow = createCase({
    guildId: guild.id,
    userId: member.id,
    moderatorId,
    type: 'mute',
    reason,
    durationMs,
  });
  try {
    await member.roles.add(role, `Mute — Case #${caseRow.case_number}${reason ? ` | ${reason}` : ''}`);
  } catch (err) {
    deactivateCase(caseRow.id);
    hideCase(caseRow.id);
    throw err;
  }
  if (durationMs) scheduleCase(caseRow.id);
  await logCase(guild, caseRow, { clientId });
  return { caseRow, role };
}

// Gỡ mute: xoá role + đóng case mute + tạo case unmute + log.
// Trả về case unmute, hoặc null nếu không có gì để làm.
export async function removeMute(guild, { userId, member = null, moderatorId, reason = null, clientId = null }) {
  const cfg = getGuildConfig(guild.id);
  const activeMutes = getActiveCases(guild.id, userId, 'mute');
  const hasRole = Boolean(cfg.mute_role_id && member?.roles?.cache?.has(cfg.mute_role_id));
  if (!activeMutes.length && !hasRole) return null;

  for (const c of activeMutes) cancelCaseTimer(c.id);
  deactivateCases(guild.id, userId, 'mute');

  if (member && cfg.mute_role_id && member.roles.cache.has(cfg.mute_role_id)) {
    await member.roles
      .remove(cfg.mute_role_id, `Unmute${reason ? ` | ${reason}` : ''}`)
      .catch((err) => console.error(`[mute] Không gỡ được role cho ${userId}:`, err.message));
  }

  const caseRow = createCase({
    guildId: guild.id,
    userId,
    moderatorId,
    type: 'unmute',
    reason,
  });
  await logCase(guild, caseRow, { clientId });
  return caseRow;
}
