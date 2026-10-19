// Install / uninstall: verifies every configured role & channel, applies the setup
// (roles, channel restrictions, setup messages) and can remove the setup messages again.
import { PermissionsBitField } from 'discord.js';
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { deleteInstallMessage, getInstallMessage, listInstallMessages, setInstallMessage } from '../db.js';
import { baseEmbed } from '../utils/embeds.js';
import { applyMuteOverwritesAll, applyMutedCmdsOverwrite, ensureMuteRole } from './mutes.js';
import { ensureBotsRole, ensureBotPermsRole, ensureBotRole, ensureMemberRole } from './roles.js';
import { STATUS_MESSAGE_KEY, refreshStatusMessage } from './status.js';
import { SERVER_STATS_MESSAGE_KEY, refreshServerStatsMessage } from './serverstats.js';
import { TRAP_MESSAGE_KEY, applyTrapOpenOverwrite, refreshTrapMessage } from './trap.js';
import { TICKET_PANEL_MESSAGE_KEY, refreshTicketPanelMessage } from './tickets.js';

export const MUTED_CMDS_MESSAGE_KEY = 'muted_cmds';

export const INSTALL_MESSAGE_LABELS = {
  [TRAP_MESSAGE_KEY]: 'Do-not-type warning message',
  [MUTED_CMDS_MESSAGE_KEY]: 'Muted-commands notice',
  [STATUS_MESSAGE_KEY]: 'Bot status message',
  [SERVER_STATS_MESSAGE_KEY]: 'Server stats message',
  [TICKET_PANEL_MESSAGE_KEY]: 'Ticket panel message',
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
  let memberRole = null;
  let botsRole = null;
  let botRole = null;
  let permsRole = null;

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

  // Whether the bot already runs as Administrator (needed to create/edit the admin perms role).
  const meIsAdmin = Boolean(guild.members.me?.permissions.has(PermissionsBitField.Flags.Administrator));

  // 1. Bot role (visible bot identity - sits below Member, stripped of every permission)
  try {
    const existing = await findRole(guild, config.botRoleId, config.botRoleName);
    botRole = await ensureBotRole(guild, { reason: by });
    const strip = {};
    if (meIsAdmin && botRole.permissions.toArray().length) {
      strip.permissions = [];
    }
    if (botRole.hoist) {
      strip.hoist = false; // keeps the bot out of its own sidebar group, below Member
    }
    if (Object.keys(strip).length) {
      await botRole.edit({ ...strip, reason: by }).catch(() => {});
    }
    results.push({
      label: 'Bot role',
      status: existing ? 'OK' : 'Created',
      detail: `<@&${botRole.id}> - visible bot role below Member; permissions removed (the bot runs as Administrator via the hidden perms role).`,
    });
  } catch (err) {
    results.push({ label: 'Bot role', status: 'Failed', detail: err.message });
  }

  // 2. Hidden perms role (Administrator only, not hoisted - its list position no longer matters)
  try {
    const existing = await findRole(guild, config.botPermsRoleId, config.botPermsRoleName);
    permsRole = await ensureBotPermsRole(guild, { reason: by });
    // Upgrade an older perms role to Administrator (only possible once the bot itself is admin).
    if (meIsAdmin && !permsRole.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await permsRole
        .edit({ permissions: [PermissionsBitField.Flags.Administrator], reason: by })
        .catch(() => {});
    }
    if (!existing) {
      await guild.members.me.roles.add(permsRole, by).catch(() => {});
    }
    if (botRole) {
      await guild.members.me.roles.add(botRole, by).catch(() => {});
    }
    results.push({
      label: 'Bot perms role',
      status: existing ? 'OK' : 'Created',
      detail: `<@&${permsRole.id}> - hidden role carrying **Administrator** (not shown in member profiles). Assign it to the bot if it has not been; with Administrator the bot ignores role positions, so this role can stay at the bottom of the list.`,
    });
  } catch (err) {
    results.push({
      label: 'Bot perms role',
      status: 'Failed',
      detail: `${err.message} - re-invite the bot with Administrator (invite link in the README) and run this again.`,
    });
  }

  // 2. Bots role (shared role for bot accounts)
  try {
    const existing = await findRole(guild, config.botsRoleId, config.botsRoleName);
    botsRole = await ensureBotsRole(guild, { reason: by });
    let assigned = 0;
    if (!existing) {
      for (const member of guild.members.cache.filter((m) => m.user.bot).values()) {
        await member.roles.add(botsRole, by).then(() => assigned++).catch(() => {});
      }
    }
    results.push({
      label: 'Bots role',
      status: existing ? 'OK' : 'Created',
      detail: `<@&${botsRole.id}>${assigned ? ` - assigned to ${assigned} existing bot(s)` : ''} - new bots get it automatically on join.`,
    });
  } catch (err) {
    results.push({ label: 'Bots role', status: 'Failed', detail: err.message });
  }

  // 3. Muted role (above Member, but kept visually invisible: no colour, not hoisted)
  try {
    const existing = await findRole(guild, config.muteRoleId, config.muteRoleName);
    muteRole = await ensureMuteRole(guild, { reason: by });
    const polish = {};
    if (muteRole.color) polish.color = null; // usernames keep their default (black) colour
    if (muteRole.hoist) polish.hoist = false;
    if (Object.keys(polish).length) {
      await muteRole.edit({ ...polish, reason: by }).catch(() => {});
    }
    results.push({
      label: 'Muted role',
      status: existing ? 'OK' : 'Created',
      detail: `<@&${muteRole.id}> - positioned above Member, but with no colour and never shown separately (muted usernames stay their default colour); chatting is denied via channel overwrites`,
    });
  } catch (err) {
    results.push({ label: 'Muted role', status: 'Failed', detail: err.message });
  }

  // 4. Member (verified) role
  try {
    const existing = await findRole(guild, config.memberRoleId, config.memberRoleName);
    memberRole = await ensureMemberRole(guild, { reason: by });
    results.push({
      label: 'Member role',
      status: existing ? 'OK' : 'Created',
      detail: `<@&${memberRole.id}> - basic access: view channels and chat. Restricted categories are configured separately in Discord.`,
    });
  } catch (err) {
    results.push({ label: 'Member role', status: 'Failed', detail: err.message });
  }

  // 5. Mod log channel
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

  // 6. Do-not-type channel + Warning message
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
        // Keep the trap catchable: explicitly open the channel to everyone (incl. role-less users/bots).
        await applyTrapOpenOverwrite(channel, by);
        const message = await refreshTrapMessage(client);
        results.push({
          label: 'Do-not-type channel',
          status: message ? (stored ? 'Updated' : 'Created') : 'Failed',
          detail: message
            ? `<#${channel.id}> - Warning message ${stored ? 'refreshed' : 'posted'}; anyone who types here is auto-${config.doNotType?.action ?? 'kick'}ed`
            : 'Could not post the Warning message (check permissions).',
        });
      }
    } catch (err) {
      results.push({ label: 'Do-not-type channel', status: 'Failed', detail: err.message });
    }
  }

  // 7. Muted-commands channel + notice
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
            ? `<#${channel.id}> - visible to muted users (with commands) and staff only; everyone else is locked out`
            : 'Could not post the notice (check permissions).',
        });
      }
    } catch (err) {
      results.push({ label: 'Muted-commands channel', status: 'Failed', detail: err.message });
    }
  }

  // 8. Bot status channel + live status card
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

  // 9. Server stats channel + live Server Report card (+ All-Members voice channel sync)
  if (!config.serverStatsChannelId) {
    results.push({
      label: 'Server stats channel',
      status: 'Not set',
      detail: 'Add `serverStatsChannelId` to config.json to publish the Server Report card.',
    });
  } else {
    try {
      const channel = await guild.channels.fetch(config.serverStatsChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        results.push({
          label: 'Server stats channel',
          status: 'Failed',
          detail: 'Channel not found or not text-based. Check `serverStatsChannelId`.',
        });
      } else {
        const stored = getInstallMessage(guild.id, SERVER_STATS_MESSAGE_KEY);
        const message = await refreshServerStatsMessage(client);
        results.push({
          label: 'Server stats channel',
          status: message ? (stored ? 'Updated' : 'Created') : 'Failed',
          detail: message
            ? `<#${channel.id}> - Server Report card ${stored ? 'refreshed' : 'posted'} (members, online and server info; auto-updates every minute)${
                config.serverStatsVoiceChannelId ? ' - All-Members voice channel name kept in sync' : ''
              }`
            : 'Could not post the Server Report (check permissions).',
        });
      }
    } catch (err) {
      results.push({ label: 'Server stats channel', status: 'Failed', detail: err.message });
    }
  }

  // 10. Ticket panel (single Open-Ticket button; tickets spawn in the same category)
  if (!config.tickets?.panelChannelId) {
    results.push({
      label: 'Ticket panel',
      status: 'Not set',
      detail: 'Add `tickets.panelChannelId` to config.json to publish the Open-Ticket button.',
    });
  } else {
    try {
      const channel = await guild.channels.fetch(config.tickets.panelChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        results.push({
          label: 'Ticket panel',
          status: 'Failed',
          detail: 'Channel not found or not text-based. Check `tickets.panelChannelId`.',
        });
      } else {
        const stored = getInstallMessage(guild.id, TICKET_PANEL_MESSAGE_KEY);
        const message = await refreshTicketPanelMessage(client);
        results.push({
          label: 'Ticket panel',
          status: message ? (stored ? 'Updated' : 'Created') : 'Failed',
          detail: message
            ? `<#${channel.id}> - Open-Ticket button ${stored ? 'refreshed' : 'posted'}; tickets open in the same category, visible to the opener${
                config.tickets.staffRoleId ? ` and <@&${config.tickets.staffRoleId}>` : ''
              } only (category is taken from this channel)`
            : 'Could not post the ticket panel (check permissions).',
        });
      }
    } catch (err) {
      results.push({ label: 'Ticket panel', status: 'Failed', detail: err.message });
    }
  }

  // 11. Channel restrictions everywhere else
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

  // 11. Best-effort ordering (top to bottom): muted > member > bots > bot (visible) > perms (hidden).
  // With Administrator the bot ignores role positions, so the perms role can rest at the very bottom.
  if (permsRole && memberRole && botsRole && botRole && muteRole) {
    const desired = [muteRole, memberRole, botsRole, botRole, permsRole];
    for (let i = 1; i < desired.length; i++) {
      try {
        if (desired[i].position >= desired[i - 1].position) {
          await desired[i].edit({ position: desired[i - 1].position, reason: by });
        }
      } catch {
        // Discord forbids moving roles the bot cannot manage - the summary covers the manual step.
      }
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
