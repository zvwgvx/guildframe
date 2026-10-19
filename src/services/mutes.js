// Mute business logic: manages the Muted role + per-channel overwrites, role assign/remove, cases, timers.
import { ChannelType } from 'discord.js';
import { config, updateFileConfig } from '../config.js';
import { createCase, getActiveCases, hideCase, setActiveCasesStatus, setCaseStatus } from '../db.js';
import { logCase } from './log.js';
import { cancelCaseTimer, scheduleCase } from './scheduler.js';

// Finds or creates the Muted role (config.muteRoleId takes priority; the created role id is persisted).
export async function ensureMuteRole(guild, { createIfMissing = true, reason = 'Mute role setup' } = {}) {
  let role = config.muteRoleId ? await guild.roles.fetch(config.muteRoleId).catch(() => null) : null;

  if (!role) {
    role =
      guild.roles.cache.find(
        (r) => !r.managed && r.name.toLowerCase() === String(config.muteRoleName).toLowerCase(),
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
    console.log(`[mute] Created the "${role.name}" role (${role.id}).`);
  }
  if (config.muteRoleId !== role.id) {
    updateFileConfig({ muteRoleId: role.id });
    console.log(`[mute] Saved muteRoleId=${role.id} to config.json.`);
  }
  return role;
}

// Channel overwrite applied to every channel for the Muted role.
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

export async function applyMuteOverwrite(channel, role, reason = 'Apply Muted role restrictions') {
  await channel.permissionOverwrites.edit(role, muteOverwriteOptions(channel), { reason });
}

// Applies the overwrite to every existing channel (categories are skipped).
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

// Applies a mute: assigns the role, creates the case, logs it and schedules the timer.
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
    await member.roles.add(role, `Mute - Case #${caseRow.case_number}${reason ? ` | ${reason}` : ''}`);
  } catch (err) {
    setCaseStatus(caseRow.id, 'removed');
    hideCase(caseRow.id);
    throw err;
  }
  if (durationMs) scheduleCase(caseRow.id);
  await logCase(guild, caseRow, { clientId });
  return { caseRow, role };
}

// Removes a mute: takes the role away, closes active mute cases, creates the unmute case.
// Returns the unmute case, or null when there is nothing to do.
export async function removeMute(guild, { userId, member = null, moderatorId, reason = null, clientId = null }) {
  const activeMutes = getActiveCases(guild.id, userId, 'mute');
  const hasRole = Boolean(config.muteRoleId && member?.roles?.cache?.has(config.muteRoleId));
  if (!activeMutes.length && !hasRole) return null;

  for (const c of activeMutes) cancelCaseTimer(c.id);
  setActiveCasesStatus(guild.id, userId, 'mute', 'removed');

  if (member && config.muteRoleId && member.roles.cache.has(config.muteRoleId)) {
    await member.roles
      .remove(config.muteRoleId, `Unmute${reason ? ` | ${reason}` : ''}`)
      .catch((err) => console.error(`[mute] Failed to remove the Muted role from ${userId}:`, err.message));
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
