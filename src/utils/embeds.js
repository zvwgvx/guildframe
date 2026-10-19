import { EmbedBuilder } from 'discord.js';
import { CASE_STATUS, COLORS, TYPE_META } from '../constants.js';
import { formatDuration, formatDurationCompact } from './duration.js';

export const ts = (ms, style = 'F') => `<t:${Math.floor(ms / 1000)}:${style}>`;
export const rel = (ms) => ts(ms, 'R');

export const baseEmbed = (color = COLORS.info) => new EmbedBuilder().setColor(color);

export const successEmbed = (description, title = 'Success') =>
  baseEmbed(COLORS.success).setTitle(title).setDescription(description);

export const errorEmbed = (description, title = 'Action failed') =>
  baseEmbed(COLORS.error).setTitle(title).setDescription(description);

export const infoEmbed = (title, description) => baseEmbed(COLORS.info).setTitle(title).setDescription(description);

const typeMeta = (caseRow) => TYPE_META[caseRow.type] ?? TYPE_META.note;

const statusLabel = (caseRow) => {
  const status = CASE_STATUS[caseRow.status] ?? CASE_STATUS.removed;
  return status.label;
};

const staffMention = (caseRow, clientId) =>
  caseRow.moderator_id === 'system' || (clientId && caseRow.moderator_id === clientId)
    ? 'System (automatic)'
    : `<@${caseRow.moderator_id}>`;

// One punishment block, e.g.:
// ● **MUTE** ( `#9887` ) | 10 days ago
// > **Status:** Active
// > **Reason:** Negative Use of Disabilities (Offence #1)
// > **Staff:** @MaxGamer
// > **Expires:** in 11 days
export function punishmentEntry(caseRow, { clientId = null } = {}) {
  const meta = typeMeta(caseRow);
  const lines = [
    `● **${meta.label}** ( \`#${caseRow.case_number}\` ) | ${rel(caseRow.created_at)}`,
    `> **Status:** ${statusLabel(caseRow)}`,
  ];
  const reason = caseRow.reason || 'No reason provided';
  const offence = caseRow.offence_no ? ` (Offence #${caseRow.offence_no})` : '';
  lines.push(`> **Reason:** ${reason}${offence}`);
  lines.push(`> **Staff:** ${staffMention(caseRow, clientId)}`);
  if (caseRow.expires_at) lines.push(`> **Expires:** ${rel(caseRow.expires_at)}`);
  return lines.join('\n');
}

// Punishments history embed (matches the "Punishments • user • Page x of y" style).
export function buildPunishmentsEmbed({ user, cases, page, totalPages, total, guildName, clientId = null }) {
  const embed = baseEmbed(COLORS.info)
    .setTitle(`Punishments • ${user.username} • Page ${page + 1} of ${totalPages}`)
    .setDescription(cases.map((c) => punishmentEntry(c, { clientId })).join('\n\n'))
    .setFooter({ text: `${guildName} • Page ${page + 1}/${totalPages} • Total: ${total}` })
    .setTimestamp(Date.now());
  const avatar = user.displayAvatarURL?.({ extension: 'png', size: 128 });
  if (avatar) embed.setThumbnail(avatar);
  return embed;
}

const ACTION_TITLES = {
  mute: 'Player Muted',
  unmute: 'Player Unmuted',
  kick: 'Player Kicked',
  ban: 'Player Banned',
  unban: 'Player Unbanned',
  warn: 'Player Warned',
  note: 'Note Added',
  alert: 'Alert',
};

// Action confirmation embed (matches the "Player Muted" style).
export function buildActionEmbed({ action, target, durationMs = null, reason = null, offenceNo = null, guildName = null }) {
  const meta = TYPE_META[action] ?? TYPE_META.note;
  const mention = `<@${target.id}>`;
  let sentence;
  switch (action) {
    case 'mute':
      sentence = durationMs ? `Muted ${mention} for **${formatDurationCompact(durationMs)}**.` : `Muted ${mention} permanently.`;
      break;
    case 'ban':
      sentence = durationMs ? `Banned ${mention} for **${formatDurationCompact(durationMs)}**.` : `Banned ${mention} permanently.`;
      break;
    case 'unmute':
      sentence = `Unmuted ${mention}.`;
      break;
    case 'unban':
      sentence = `Unbanned ${mention}.`;
      break;
    case 'kick':
      sentence = `Kicked ${mention}.`;
      break;
    case 'warn':
      sentence = `Warned ${mention}.`;
      break;
    default:
      sentence = `${mention}`;
  }
  const lines = [sentence];
  if (reason) lines.push(`**Reason:** ${reason}${offenceNo ? ` (Offence #${offenceNo})` : ''}`);
  else if (offenceNo) lines.push(`**Offence:** #${offenceNo}`);

  const embed = baseEmbed(meta.color)
    .setTitle(ACTION_TITLES[action] ?? 'Action applied')
    .setDescription(lines.join('\n'))
    .setTimestamp(Date.now());
  const avatar = target.displayAvatarURL?.({ extension: 'png', size: 128 });
  if (avatar) embed.setThumbnail(avatar);
  if (guildName) embed.setFooter({ text: guildName });
  return embed;
}

// Detailed single-case embed (used by /case view).
export function buildCaseEmbed(caseRow, { clientId = null } = {}) {
  const meta = typeMeta(caseRow);
  const lines = [
    `**Status:** ${statusLabel(caseRow)}`,
    `**User:** <@${caseRow.user_id}>`,
    `**Staff:** ${staffMention(caseRow, clientId)}`,
  ];
  if (caseRow.reason) lines.push(`**Reason:** ${caseRow.reason}`);
  if (caseRow.offence_no) lines.push(`**Offence:** #${caseRow.offence_no}`);
  if (caseRow.duration_ms) lines.push(`**Duration:** ${formatDuration(caseRow.duration_ms)}`);
  if (caseRow.expires_at) lines.push(`**Expires:** ${ts(caseRow.expires_at, 'F')} (${rel(caseRow.expires_at)})`);
  lines.push(`**Created:** ${ts(caseRow.created_at, 'F')}`);

  return baseEmbed(meta.color)
    .setTitle(`Case #${caseRow.case_number} • ${meta.label}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `User ID: ${caseRow.user_id}` })
    .setTimestamp(caseRow.created_at);
}

// Generic embed for mod log / audit log entries.
export function buildAuditEmbed({ title, description, color = COLORS.audit, fields = [] }) {
  const embed = baseEmbed(color).setTitle(title).setDescription(description).setTimestamp(Date.now());
  if (fields.length) embed.addFields(fields);
  return embed;
}
