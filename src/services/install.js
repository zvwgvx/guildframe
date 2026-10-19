// Install / uninstall: verifies every configured role & channel, applies the setup
// (roles, channel restrictions, setup messages) and can remove the setup messages again.
import { PermissionsBitField } from 'discord.js';
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { deleteInstallMessage, getInstallMessage, listInstallMessages, setInstallMessage } from '../db.js';
import { baseEmbed } from '../utils/embeds.js';
import { applyMuteOverwritesAll, applyMutedCmdsOverwrite, ensureMuteRole } from './mutes.js';
import { ensureMemberRole } from './roles.js';
import { STATUS_MESSAGE_KEY, refreshStatusMessage } from './status.js';
import { TRAP_MESSAGE_KEY, refreshTrapMessage } from './trap.js';

export const MUTED_CMDS_MESSAGE_KEY = 'muted_cmds';

export const INSTALL_MESSAGE_LABELS = {
  [TRAP_MESSAGE_KEY]: 'Do-not-type warning message',
  [MUTED_CMDS_MESSAGE_KEY]: 'Muted-commands notice',
  [STATUS_MESSAGE_KEY]: 'Bot status message',
};

// ---------- Muted-commands notice ----------

function buildMutedCmdsNotice(guild) {
  const prefix = config.prefix || '=';
  const lines = [
    'You are muted and cannot chat in the other channels.',
    '',
    'This channel is for using bot commands. Try:',
    `> \`${prefix}puns\` - view your own punishment history`,
    `> \`${prefix}help\` - list available commands`,
    '',
    'Messages here are visible to staff. Breaking the rules here can extend your punishment.',
  ];
  return {
    embeds: [baseEmbed(COLORS.mute).setTitle('Muted').setDescription(lines.join('\n')).setFooter({ text: guild.name })],
  };
}

// Edits the stored notice in the muted-commands channel, or posts a new one when missing.
export async function refreshMutedCmdsNotice(client) {
  const channelId = config.mutedBotCmdsChannelId;
  if (!channelId) return null;

  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return null;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[install] muted-commands channel ${channelId} not found or not text-based.`);
    return null;
  }

  const payload = buildMutedCmdsNotice(guild);
  const stored = getInstallMessage(guild.id, MUTED_CMDS_MESSAGE_KEY);

  if (stored?.message_id) {
    const message = await channel.messages.fetch(stored.message_id).catch(() => null);
    if (message && message.author.id === client.user.id) {
      await message.edit(payload).catch(() => {});
      return message;
    }
  }

  const sent = await channel.send(payload);
  setInstallMessage(guild.id, MUTED_CMDS_MESSAGE_KEY, channel.id, sent.id);
  return sent;
}

// ---------- Install ----------

const findRole = async (guild, id, name) =>
  (id ? await guild.roles.fetch(id).catch(() => null) : null) ??
  guild.roles.cache.find((r) => !r.managed && r.name.toLowerCase() === String(name).toLowerCase()) ??
  null;

// Checks/sets up everything and returns a list of { label, status, detail } results.
export async function runInstall(client, guild, { installerId = null } = {}) {
  const by = installerId ? `Install by ${installerId}` : 'Install';
  const results = [];
  let muteRole = null;

  // 0. Server check - the single server this bot is allowed to operate in
  const configuredGuildId = String(config.guildId || '').trim();
  if (!configuredGuildId) {
    results.push({
      label: 'Server',
      status: 'Not set',
      detail: 'Add `guildId` (your server ID) to config.json - the bot does not operate without it.',
    });
  } else if (configuredGuildId !== guild.id) {
    results.push({
      label: 'Server',
      status: 'Mismatch',
      detail: `config.json guildId is ${configuredGuildId}, but this server is ${guild.id} (${guild.name}).`,
    });
  } else {
    results.push({
      label: 'Server',
      status: 'OK',
      detail: `${guild.name} - ID: ${guild.id} - this is where the bot operates.`,
    });
  }

  // 1. Muted role
  try {
    const existing = await findRole(guild, config.muteRoleId, config.muteRoleName);
    muteRole = await ensureMuteRole(guild, { reason: by });
    results.push({
      label: 'Muted role',
      status: existing ? 'OK' : 'Created',
      detail: `<@&${muteRole.id}> - restrictions are applied through channel permissions`,
    });
  } catch (err) {
    results.push({ label: 'Muted role', status: 'Failed', detail: err.message });
  }

  // 2. Member (verified) role
  try {
    const existing = await findRole(guild, config.memberRoleId, config.memberRoleName);
    const memberRole = await ensureMemberRole(guild, { reason: by });
    results.push({
      label: 'Member role',
      status: existing ? 'OK' : 'Created',
      detail: `<@&${memberRole.id}> - assigned automatically to new members`,
    });
  } catch (err) {
    results.push({ label: 'Member role', status: 'Failed', detail: err.message });
  }

  // 3. Mod log channel
  if (!config.modLogChannelId) {
    results.push({
      label: 'Mod log channel',
      status: 'Not set',
      detail: 'Add `modLogChannelId` to config.json to receive action logs.',
    });
  } else {
    try {
      const channel = await guild.channels.fetch(config.modLogChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        results.push({
          label: 'Mod log channel',
          status: 'Failed',
          detail: 'Channel not found or not text-based. Check `modLogChannelId`.',
        });
      } else {
        const canSend = channel.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages);
        results.push({
          label: 'Mod log channel',
          status: canSend ? 'OK' : 'Check permissions',
          detail: `<#${channel.id}>${canSend ? '' : ' - the bot cannot send messages here'}`,
        });
      }
    } catch (err) {
      results.push({ label: 'Mod log channel', status: 'Failed', detail: err.message });
    }
  }

  // 4. Do-not-type channel + Warning message
  if (!config.doNotType?.channelId) {
    results.push({
      label: 'Do-not-type channel',
      status: 'Not set',
      detail: 'Add `doNotType.channelId` to config.json to catch bots.',
    });
  } else {
    try {
      const channel = await guild.channels.fetch(config.doNotType.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        results.push({
          label: 'Do-not-type channel',
          status: 'Failed',
          detail: 'Channel not found or not text-based. Check `doNotType.channelId`.',
        });
      } else {
        const stored = getInstallMessage(guild.id, TRAP_MESSAGE_KEY);
        const message = await refreshTrapMessage(client);
        results.push({
          label: 'Do-not-type channel',
          status: message ? (stored ? 'Updated' : 'Created') : 'Failed',
          detail: message
            ? `<#${channel.id}> - Warning message ${stored ? 'refreshed' : 'posted'}`
            : 'Could not post the Warning message (check permissions).',
        });
      }
    } catch (err) {
      results.push({ label: 'Do-not-type channel', status: 'Failed', detail: err.message });
    }
  }

  // 5. Muted-commands channel + notice
  if (!config.mutedBotCmdsChannelId) {
    results.push({
      label: 'Muted-commands channel',
      status: 'Not set',
      detail: 'Add `mutedBotCmdsChannelId` to config.json so muted users can still use commands.',
    });
  } else {
    try {
      const channel = await guild.channels.fetch(config.mutedBotCmdsChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        results.push({
          label: 'Muted-commands channel',
          status: 'Failed',
          detail: 'Channel not found or not text-based. Check `mutedBotCmdsChannelId`.',
        });
      } else {
        if (muteRole) await applyMutedCmdsOverwrite(channel, muteRole, by);
        const stored = getInstallMessage(guild.id, MUTED_CMDS_MESSAGE_KEY);
        const message = await refreshMutedCmdsNotice(client);
        results.push({
          label: 'Muted-commands channel',
          status: message ? (stored ? 'Updated' : 'Created') : 'Failed',
          detail: message
            ? `<#${channel.id}> - muted users keep access here`
            : 'Could not post the notice (check permissions).',
        });
      }
    } catch (err) {
      results.push({ label: 'Muted-commands channel', status: 'Failed', detail: err.message });
    }
  }

  // 6. Bot status channel + live status card
  if (!config.botStatusChannelId) {
    results.push({
      label: 'Bot status channel',
      status: 'Not set',
      detail: 'Add `botStatusChannelId` to config.json to publish the live status card.',
    });
  } else {
    try {
      const channel = await guild.channels.fetch(config.botStatusChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        results.push({
          label: 'Bot status channel',
          status: 'Failed',
          detail: 'Channel not found or not text-based. Check `botStatusChannelId`.',
        });
      } else {
        const stored = getInstallMessage(guild.id, STATUS_MESSAGE_KEY);
        const message = await refreshStatusMessage(client);
        results.push({
          label: 'Bot status channel',
          status: message ? (stored ? 'Updated' : 'Created') : 'Failed',
          detail: message
            ? `<#${channel.id}> - status card ${stored ? 'refreshed' : 'posted'} (auto-updates every minute)`
            : 'Could not post the status card (check permissions).',
        });
      }
    } catch (err) {
      results.push({ label: 'Bot status channel', status: 'Failed', detail: err.message });
    }
  }

  // 7. Channel restrictions everywhere else
  if (muteRole) {
    try {
      const { ok, failed } = await applyMuteOverwritesAll(guild, muteRole);
      results.push({
        label: 'Channel restrictions',
        status: failed ? 'Check permissions' : 'OK',
        detail: `Restrictions applied to ${ok} channel(s)${
          failed ? ` - ${failed} failed (the bot needs Manage Roles and a role above Muted)` : ''
        }.`,
      });
    } catch (err) {
      results.push({ label: 'Channel restrictions', status: 'Failed', detail: err.message });
    }
  }

  return results;
}

// ---------- Uninstall ----------

// Deletes every tracked setup message. Returns a list of { label, status, detail } results.
export async function runUninstall(client, guild) {
  const rows = listInstallMessages(guild.id);
  if (!rows.length) {
    return [{ label: 'Setup messages', status: 'OK', detail: 'No setup messages are currently tracked.' }];
  }

  const results = [];
  for (const row of rows) {
    const label = INSTALL_MESSAGE_LABELS[row.key] ?? row.key;
    try {
      const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
      let status = 'OK';
      let detail;

      if (!channel || !channel.isTextBased()) {
        detail = 'Channel no longer exists - nothing to delete.';
      } else {
        const message = await channel.messages.fetch(row.message_id).catch(() => null);
        if (!message) {
          detail = `Message in <#${row.channel_id}> was already gone.`;
        } else if (message.author.id !== client.user.id) {
          status = 'Skipped';
          detail = `The message in <#${row.channel_id}> was not sent by the bot - skipped.`;
        } else {
          await message.delete();
          status = 'Removed';
          detail = `Deleted from <#${row.channel_id}>.`;
        }
      }

      deleteInstallMessage(guild.id, row.key);
      results.push({ label, status, detail });
    } catch (err) {
      results.push({ label, status: 'Failed', detail: err.message });
    }
  }
  return results;
}

// ---------- Summary embed ----------

// Statuses that keep the install report from being "fully ready".
export const INSTALL_DELAYING_STATUSES = new Set(['Failed', 'Not set', 'Check permissions', 'Mismatch']);

export function buildSetupSummaryEmbed(results, { title, description = null, report = false } = {}) {
  const hasFailure = report
    ? results.some((r) => INSTALL_DELAYING_STATUSES.has(r.status))
    : results.some((r) => r.status === 'Failed');
  const embed = baseEmbed(hasFailure ? COLORS.warn : COLORS.success).setTitle(title).setTimestamp(Date.now());
  if (description) embed.setDescription(description);
  for (const r of results) {
    embed.addFields({ name: r.label, value: r.detail ? `**${r.status}** - ${r.detail}` : `**${r.status}**` });
  }

  if (report) {
    const delaying = results.filter((r) => INSTALL_DELAYING_STATUSES.has(r.status));
    const ready = results.length - delaying.length;
    const lines = delaying.length
      ? [
          `Ready: **${ready}/${results.length}**.`,
          `Not ready (${delaying.length}): ${delaying.map((r) => `${r.label} (${r.status})`).join(', ')}`,
          'Fill the missing IDs in `config.json`, then run this command again.',
        ]
      : [`Ready: **${ready}/${results.length}** - the bot is fully set up.`];
    embed.addFields({ name: 'Report', value: lines.join('\n') });
  }
  return embed;
}
