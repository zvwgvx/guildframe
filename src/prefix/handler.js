// Prefix command dispatcher. Usage: =mute <target> [duration] [reason]
// Every slash command has a prefix equivalent here.
import { PermissionsBitField } from 'discord.js';
import { config } from '../config.js';
import { HISTORY_PAGE_SIZE, MAX_BAN_MS, MAX_MUTE_MS, WARNINGS_PAGE_SIZE } from '../constants.js';
import {
  countActiveByType,
  createCase,
  getActiveCases,
  getCaseByNumber,
  hideCase,
  listCases,
  setActiveCasesStatus,
} from '../db.js';
import { applyWarnEscalation } from '../services/escalation.js';
import { buildSetupSummaryEmbed, runInstall, runUninstall } from '../services/install.js';
import { logCase } from '../services/log.js';
import { applyMute, applyMuteOverwritesAll, ensureMuteRole, removeMute } from '../services/mutes.js';
import { offencesTopEmbed, offencesUserEmbed } from '../services/offencesView.js';
import { cancelCaseTimer, scheduleCase } from '../services/scheduler.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import {
  baseEmbed,
  buildActionEmbed,
  buildCaseEmbed,
  buildPunishmentsEmbed,
  errorEmbed,
  infoEmbed,
  successEmbed,
  truncate,
  ts,
} from '../utils/embeds.js';
import { paginateMessage } from '../utils/paginate.js';
import { canModerateMemberMessage, ensureModeratorMessage } from '../utils/permissions.js';

const ALIASES = {
  mute: 'mute',
  unmute: 'unmute',
  kick: 'kick',
  ban: 'ban',
  unban: 'unban',
  warn: 'warn',
  history: 'history',
  puns: 'history',
  h: 'history',
  punishments: 'history',
  offences: 'offences',
  case: 'case',
  warnings: 'warnings',
  setup: 'setup',
  install: 'install',
  uninstall: 'uninstall',
  help: 'help',
};

const DURATION_TOKEN = /^(?:\d+[smhdw])+$|^perm(?:anent|anently)?$/i;
const HISTORY_TYPES = ['all', 'warn', 'mute', 'kick', 'ban', 'unmute', 'unban', 'note'];

const looksLikeDuration = (token) => DURATION_TOKEN.test(token);

// Resolves a target from a mention, a raw user ID, or a username. Returns GuildMember | User | null.
async function resolveTarget(guild, input) {
  if (!input) return null;
  const mention = input.match(/^<@!?(\d{17,20})>$/);
  const id = mention ? mention[1] : /^\d{17,20}$/.test(input) ? input : null;

  if (id) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (member) return member;
    return (await guild.client.users.fetch(id).catch(() => null)) ?? null;
  }

  const results = await guild.members.fetch({ query: input, limit: 10 }).catch(() => null);
  if (!results?.size) return null;
  const lower = input.toLowerCase();
  return (
    results.find(
      (m) => m.user.username.toLowerCase() === lower || (m.user.globalName ?? '').toLowerCase() === lower,
    ) ?? results.first()
  );
}

const isMember = (target) => typeof target?.roles !== 'undefined';
const toUser = (target) => (isMember(target) ? target.user : target);

function parseDurationArgs(args) {
  let durationInput = null;
  let reasonParts = args.slice(1);
  if (args[1] && looksLikeDuration(args[1])) {
    durationInput = args[1];
    reasonParts = args.slice(2);
  }
  return { durationInput, reason: reasonParts.join(' ').trim() || null };
}

// ---------- Commands ----------

async function muteCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageRoles, 'Manage Roles')) return;
  if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return message.reply({ embeds: [errorEmbed('The bot is missing the **Manage Roles** permission.')] });
  }

  const target = await resolveTarget(message.guild, args[0]);
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });
  if (!isMember(target)) return message.reply({ embeds: [errorEmbed('That user is not in this server.')] });
  if (!canModerateMemberMessage(message, target)) return;

  const { durationInput, reason } = parseDurationArgs(args);
  let durationMs;
  try {
    durationMs = parseDuration(durationInput);
  } catch (err) {
    return message.reply({ embeds: [errorEmbed(err.message)] });
  }
  if (durationMs && durationMs > MAX_MUTE_MS) {
    return message.reply({ embeds: [errorEmbed(`Maximum mute duration is ${formatDuration(MAX_MUTE_MS)}.`)] });
  }

  const active = getActiveCases(message.guild.id, target.id, 'mute');
  if (active.length) {
    return message.reply({
      embeds: [errorEmbed(`<@${target.id}> is already muted (Case #${active[0].case_number}). Use \`${config.prefix}unmute\` first.`)],
    });
  }

  try {
    const { caseRow } = await applyMute(message.guild, target, {
      moderatorId: message.author.id,
      reason,
      durationMs,
      clientId: client.user.id,
    });
    await message.reply({
      embeds: [
        buildActionEmbed({
          action: 'mute',
          target: target.user,
          durationMs,
          reason,
          offenceNo: caseRow.offence_no,
          guildName: message.guild.name,
        }),
      ],
    });
  } catch (err) {
    console.error('[prefix:mute]', err);
    await message.reply({ embeds: [errorEmbed(`Could not mute: ${err.message}`)] });
  }
}

async function unmuteCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageRoles, 'Manage Roles')) return;

  const target = await resolveTarget(message.guild, args[0]);
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });

  const reason = args.slice(1).join(' ').trim() || null;
  try {
    const caseRow = await removeMute(message.guild, {
      userId: target.id,
      member: isMember(target) ? target : null,
      moderatorId: message.author.id,
      reason,
      clientId: client.user.id,
    });
    if (!caseRow) return message.reply({ embeds: [errorEmbed(`<@${target.id}> is not muted.`)] });
    await message.reply({
      embeds: [
        buildActionEmbed({
          action: 'unmute',
          target: toUser(target),
          reason,
          guildName: message.guild.name,
        }),
      ],
    });
  } catch (err) {
    console.error('[prefix:unmute]', err);
    await message.reply({ embeds: [errorEmbed(`Could not unmute: ${err.message}`)] });
  }
}

async function kickCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.KickMembers, 'Kick Members', { modRoleAllowed: false })) return;
  if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    return message.reply({ embeds: [errorEmbed('The bot is missing the **Kick Members** permission.')] });
  }

  const target = await resolveTarget(message.guild, args[0]);
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });
  if (!isMember(target)) return message.reply({ embeds: [errorEmbed('That user is not in this server.')] });
  if (!canModerateMemberMessage(message, target)) return;

  const reason = args.slice(1).join(' ').trim() || null;
  const caseRow = createCase({
    guildId: message.guild.id,
    userId: target.id,
    moderatorId: message.author.id,
    type: 'kick',
    reason,
  });
  try {
    await target.kick(`Case #${caseRow.case_number} by ${message.author.tag}${reason ? `: ${reason}` : ''}`.slice(0, 512));
  } catch (err) {
    hideCase(caseRow.id);
    return message.reply({ embeds: [errorEmbed(`Could not kick: ${err.message}`)] });
  }
  await logCase(message.guild, caseRow, { clientId: client.user.id });
  await message.reply({
    embeds: [
      buildActionEmbed({
        action: 'kick',
        target: target.user,
        reason,
        offenceNo: caseRow.offence_no,
        guildName: message.guild.name,
      }),
    ],
  });
}

async function banCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.BanMembers, 'Ban Members', { modRoleAllowed: false })) return;
  if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    return message.reply({ embeds: [errorEmbed('The bot is missing the **Ban Members** permission.')] });
  }

  const target = await resolveTarget(message.guild, args[0]);
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });
  if (target.id === client.user.id) return message.reply({ embeds: [errorEmbed('I cannot ban myself.')] });
  if (isMember(target) && !canModerateMemberMessage(message, target)) return;

  const existing = await message.guild.bans.fetch(target.id).catch(() => null);
  if (existing) return message.reply({ embeds: [errorEmbed(`<@${target.id}> is already banned.`)] });

  const { durationInput, reason } = parseDurationArgs(args);
  let durationMs;
  try {
    durationMs = parseDuration(durationInput);
  } catch (err) {
    return message.reply({ embeds: [errorEmbed(err.message)] });
  }
  if (durationMs && durationMs > MAX_BAN_MS) {
    return message.reply({ embeds: [errorEmbed(`Maximum ban duration is ${formatDuration(MAX_BAN_MS)}.`)] });
  }

  const caseRow = createCase({
    guildId: message.guild.id,
    userId: target.id,
    moderatorId: message.author.id,
    type: 'ban',
    reason,
    durationMs,
  });
  try {
    await message.guild.bans.create(target.id, {
      deleteMessageSeconds: 0,
      reason: `Case #${caseRow.case_number} by ${message.author.tag}${reason ? `: ${reason}` : ''}`.slice(0, 512),
    });
  } catch (err) {
    hideCase(caseRow.id);
    return message.reply({ embeds: [errorEmbed(`Could not ban: ${err.message}`)] });
  }
  if (durationMs) scheduleCase(caseRow.id);
  await logCase(message.guild, caseRow, { clientId: client.user.id });
  await message.reply({
    embeds: [
      buildActionEmbed({
        action: 'ban',
        target: toUser(target),
        durationMs,
        reason,
        offenceNo: caseRow.offence_no,
        guildName: message.guild.name,
      }),
    ],
  });
}

async function unbanCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.BanMembers, 'Ban Members')) return;

  const userId = (args[0] ?? '').trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return message.reply({ embeds: [errorEmbed(`Usage: \`${config.prefix}unban <user id> [reason]\``)] });
  }
  const existing = await message.guild.bans.fetch(userId).catch(() => null);
  if (!existing) return message.reply({ embeds: [errorEmbed(`<@${userId}> is not banned.`)] });

  const reason = args.slice(1).join(' ').trim() || null;
  for (const c of getActiveCases(message.guild.id, userId, 'ban')) cancelCaseTimer(c.id);
  setActiveCasesStatus(message.guild.id, userId, 'ban', 'removed');

  try {
    await message.guild.bans.remove(
      userId,
      `Unban by ${message.author.tag}${reason ? `: ${reason}` : ''}`.slice(0, 512),
    );
  } catch (err) {
    return message.reply({ embeds: [errorEmbed(`Could not unban: ${err.message}`)] });
  }

  const caseRow = createCase({
    guildId: message.guild.id,
    userId,
    moderatorId: message.author.id,
    type: 'unban',
    reason,
  });
  await logCase(message.guild, caseRow, { clientId: client.user.id });
  await message.reply({
    embeds: [
      buildActionEmbed({ action: 'unban', target: existing.user, reason, guildName: message.guild.name }),
    ],
  });
}

async function warnCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageMessages, 'Manage Messages')) return;

  const target = await resolveTarget(message.guild, args[0]);
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });

  const reason = args.slice(1).join(' ').trim() || null;
  const caseRow = createCase({
    guildId: message.guild.id,
    userId: target.id,
    moderatorId: message.author.id,
    type: 'warn',
    reason,
  });
  await logCase(message.guild, caseRow, { clientId: client.user.id });

  const activeWarns = countActiveByType(message.guild.id, target.id, 'warn');
  const embed = buildActionEmbed({
    action: 'warn',
    target: toUser(target),
    reason,
    offenceNo: caseRow.offence_no,
    guildName: message.guild.name,
  });
  embed.addFields({ name: 'Active warnings', value: String(activeWarns), inline: true });

  try {
    const escalated = await applyWarnEscalation(message.guild, target.id, client);
    if (escalated) {
      embed.addFields({
        name: 'Automatic mute',
        value: `Reached ${escalated.threshold} warning(s) - mute applied (Case #${escalated.caseRow.case_number}).`,
      });
    }
  } catch (err) {
    console.error('[prefix:warn] Escalation failed:', err);
  }

  await message.reply({ embeds: [embed] });
}

async function historyCommand(message, args, client) {
  const inMutedCmds = Boolean(config.mutedBotCmdsChannelId && message.channelId === config.mutedBotCmdsChannelId);

  // Inside the muted-commands channel a muted user may look up their own history
  // (no arguments = their own) without any moderator permission.
  let target = null;
  if (inMutedCmds) {
    target = args[0] ? await resolveTarget(message.guild, args[0]) : message.member;
    if (!target || target.id !== message.author.id) {
      if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageMessages, 'Manage Messages')) return;
    }
  } else {
    if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageMessages, 'Manage Messages')) return;
    target = await resolveTarget(message.guild, args[0]);
  }
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });

  const user = toUser(target);
  const type = HISTORY_TYPES.includes((args[1] ?? '').toLowerCase()) ? args[1].toLowerCase() : 'all';
  const { total } = listCases({ guildId: message.guild.id, userId: user.id, type, limit: 1 });
  if (!total) return message.reply({ embeds: [infoEmbed('Punishments', `No records found for ${user.username}.`)] });

  const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);
  const render = (page) =>
    buildPunishmentsEmbed({
      user,
      cases: listCases({
        guildId: message.guild.id,
        userId: user.id,
        type,
        limit: HISTORY_PAGE_SIZE,
        offset: page * HISTORY_PAGE_SIZE,
      }).rows,
      page,
      totalPages,
      total,
      guildName: message.guild.name,
      clientId: client.user.id,
    });

  const sent = await message.reply({ embeds: [render(0)] });
  await paginateMessage(sent, { totalPages, render, authorId: message.author.id });
}

async function offencesCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageMessages, 'Manage Messages')) return;

  if (!args[0]) {
    return message.reply({ embeds: [offencesTopEmbed(message.guild.id)] });
  }

  const target = await resolveTarget(message.guild, args[0]);
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });

  await message.reply({ embeds: [offencesUserEmbed(message.guild.id, toUser(target))] });
}

async function caseCommand(message, args, client) {
  const sub = (args[0] ?? '').toLowerCase();

  // =case delete <number> [reason] (mirrors /case delete)
  if (sub === 'delete') {
    if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageGuild, 'Manage Server')) return;

    const number = Number.parseInt(args[1] ?? '', 10);
    if (!Number.isInteger(number) || number < 1) {
      return message.reply({ embeds: [errorEmbed(`Usage: \`${config.prefix}case delete <number> [reason]\``)] });
    }
    const caseRow = getCaseByNumber(message.guild.id, number);
    if (!caseRow || caseRow.hidden) return message.reply({ embeds: [errorEmbed('Case not found.')] });

    hideCase(caseRow.id);
    const reason = args.slice(2).join(' ').trim() || null;
    const noteCase = createCase({
      guildId: message.guild.id,
      userId: caseRow.user_id,
      moderatorId: message.author.id,
      type: 'note',
      reason: `Deleted Case #${caseRow.case_number} (${caseRow.type})${reason ? `: ${reason}` : ''}`,
    });
    await logCase(message.guild, noteCase, { clientId: client.user.id });
    return message.reply({ embeds: [buildCaseEmbed(noteCase, { clientId: client.user.id })] });
  }

  // =case <number> / =case view <number> (mirrors /case view)
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageMessages, 'Manage Messages')) return;

  const number = Number.parseInt((sub === 'view' ? args[1] : args[0]) ?? '', 10);
  if (!Number.isInteger(number) || number < 1) {
    return message.reply({ embeds: [errorEmbed(`Usage: \`${config.prefix}case <number>\``)] });
  }
  const caseRow = getCaseByNumber(message.guild.id, number);
  if (!caseRow || caseRow.hidden) return message.reply({ embeds: [errorEmbed('Case not found.')] });
  await message.reply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
}

// =warnings list <user> | =warnings clear <user> [reason] (mirrors /warnings)
async function warningsCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageMessages, 'Manage Messages')) return;

  const sub = (args[0] ?? '').toLowerCase();
  if (sub !== 'list' && sub !== 'clear') {
    return message.reply({
      embeds: [
        errorEmbed(
          `Usage: \`${config.prefix}warnings list <user>\` or \`${config.prefix}warnings clear <user> [reason]\``,
        ),
      ],
    });
  }

  const target = await resolveTarget(message.guild, args[1]);
  if (!target) return message.reply({ embeds: [errorEmbed('User not found. Mention them, provide an ID, or type their username.')] });
  const user = toUser(target);

  if (sub === 'list') {
    const { total } = listCases({ guildId: message.guild.id, userId: user.id, type: 'warn', limit: 1 });
    if (!total) return message.reply({ embeds: [infoEmbed('Warnings', `${user.username} has no warnings.`)] });

    const totalPages = Math.ceil(total / WARNINGS_PAGE_SIZE);
    const render = (page) => {
      const { rows } = listCases({
        guildId: message.guild.id,
        userId: user.id,
        type: 'warn',
        limit: WARNINGS_PAGE_SIZE,
        offset: page * WARNINGS_PAGE_SIZE,
      });
      const lines = rows.map((r) => {
        const status = r.status === 'active' ? 'Active' : 'Cleared';
        const reason = truncate(r.reason || 'No reason provided', 120);
        return `**#${r.case_number}** • ${ts(r.created_at, 'R')} • ${status} • by <@${r.moderator_id}>\n> ${reason}`;
      });
      return baseEmbed()
        .setTitle(`Warnings • ${user.username}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Page ${page + 1}/${totalPages} • Total: ${total}` })
        .setTimestamp(Date.now());
    };

    const sent = await message.reply({ embeds: [render(0)] });
    await paginateMessage(sent, { totalPages, render, authorId: message.author.id });
    return;
  }

  // clear
  const activeCount = countActiveByType(message.guild.id, user.id, 'warn');
  if (!activeCount) {
    return message.reply({ embeds: [infoEmbed('Warnings', `${user.username} has no active warnings.`)] });
  }

  const reason = args.slice(2).join(' ').trim() || null;
  setActiveCasesStatus(message.guild.id, user.id, 'warn', 'removed');
  const caseRow = createCase({
    guildId: message.guild.id,
    userId: user.id,
    moderatorId: message.author.id,
    type: 'note',
    reason: `Cleared ${activeCount} active warning(s)${reason ? `: ${reason}` : ''}`,
  });
  await logCase(message.guild, caseRow, { clientId: client.user.id });
  await message.reply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
}

// =setup (mirrors /setup)
async function setupCommand(message) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageGuild, 'Manage Server')) return;
  if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return message.reply({ embeds: [errorEmbed('The bot is missing the **Manage Roles** permission.')] });
  }

  const role = await ensureMuteRole(message.guild, { reason: `Setup by ${message.author.id}` });
  const { ok, failed } = await applyMuteOverwritesAll(message.guild, role);

  const lines = [
    `Muted role: <@&${role.id}>`,
    `Applied restrictions to **${ok}** channel(s)${failed ? ` (${failed} failed)` : ''}.`,
    config.modLogChannelId
      ? `Mod log channel: <#${config.modLogChannelId}>`
      : 'Mod log channel: not set - add `modLogChannelId` to config.json',
    '',
    'New channels are automatically restricted. If the Muted role is deleted, the bot recreates it on the next mute.',
  ];
  if (failed) {
    lines.push('Some channels failed: make sure the bot has **Manage Roles** and its role is above the Muted role.');
  }
  await message.reply({ embeds: [successEmbed(lines.join('\n'), 'Setup complete')] });
}

// =install (mirrors /install)
async function installCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageGuild, 'Manage Server')) return;
  if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return message.reply({ embeds: [errorEmbed('The bot is missing the **Manage Roles** permission.')] });
  }

  const results = await runInstall(client, message.guild, { installerId: message.author.id });
  const failures = results.filter((r) => r.status === 'Failed').length;
  await message.reply({
    embeds: [
      buildSetupSummaryEmbed(results, {
        title: 'Install',
        description: failures
          ? 'Setup finished with issues - check the entries below.'
          : 'Setup complete. The setup messages were posted/refreshed in the configured channels.',
      }),
    ],
  });
}

// =uninstall (mirrors /uninstall)
async function uninstallCommand(message, args, client) {
  if (!ensureModeratorMessage(message, PermissionsBitField.Flags.ManageGuild, 'Manage Server')) return;

  const results = await runUninstall(client, message.guild);
  await message.reply({
    embeds: [
      buildSetupSummaryEmbed(results, {
        title: 'Uninstall',
        description: `Setup messages were removed. Run \`${config.prefix}install\` to post them again.`,
      }),
    ],
  });
}

function helpCommand(message) {
  const p = config.prefix;
  const lines = [
    `**\`${p}mute\` <user> [duration] [reason]** - mute a member (duration: 5m, 3d, perm)`,
    `**\`${p}unmute\` <user> [reason]** - remove the mute`,
    `**\`${p}kick\` <user> [reason]** - kick a member`,
    `**\`${p}ban\` <user> [duration] [reason]** - ban a member (duration optional)`,
    `**\`${p}unban\` <user id> [reason]** - remove a ban`,
    `**\`${p}warn\` <user> [reason]** - warn a member`,
    `**\`${p}warnings list\` <user>** | **\`${p}warnings clear\` <user> [reason]** - view / clear warnings`,
    `**\`${p}puns\` | \`${p}h\` | \`${p}history\` | \`${p}punishments\` <user> [type]** - punishment history`,
    `**\`${p}offences\` [user]** - offence count (no user = top 10)`,
    `**\`${p}case\` <number>** | **\`${p}case delete\` <number> [reason]** - view / hide a case`,
    `**\`${p}setup\`** - create the Muted role + apply channel restrictions`,
    `**\`${p}install\`** - full setup check (roles, channels, setup messages)`,
    `**\`${p}uninstall\`** - delete the setup messages`,
  ];
  return message.reply({ embeds: [infoEmbed('Prefix commands', lines.join('\n'))] });
}

const HANDLERS = {
  mute: muteCommand,
  unmute: unmuteCommand,
  kick: kickCommand,
  ban: banCommand,
  unban: unbanCommand,
  warn: warnCommand,
  history: historyCommand,
  offences: offencesCommand,
  case: caseCommand,
  warnings: warningsCommand,
  setup: setupCommand,
  install: installCommand,
  uninstall: uninstallCommand,
  help: helpCommand,
};

export async function handlePrefixCommand(message, client) {
  const raw = message.content.slice(config.prefix.length).trim();
  if (!raw) return;

  const [cmdRaw, ...args] = raw.split(/\s+/);
  const command = ALIASES[cmdRaw.toLowerCase()];
  if (!command) return;

  try {
    await HANDLERS[command](message, args, client);
  } catch (err) {
    console.error(`[prefix:${command}]`, err);
    await message.reply({ embeds: [errorEmbed('Something went wrong while running this command.')] }).catch(() => {});
  }
}
