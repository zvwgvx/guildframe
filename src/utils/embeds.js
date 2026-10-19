import { EmbedBuilder } from 'discord.js';
import { COLORS, TYPE_META } from '../constants.js';
import { formatDuration } from './duration.js';

export const ts = (ms, style = 'F') => `<t:${Math.floor(ms / 1000)}:${style}>`;

export const baseEmbed = (color = COLORS.info) => new EmbedBuilder().setColor(color);

export const successEmbed = (description, title = '✅ Thành công') =>
  baseEmbed(COLORS.success).setTitle(title).setDescription(description);

export const errorEmbed = (description, title = '❌ Không thể thực hiện') =>
  baseEmbed(COLORS.error).setTitle(title).setDescription(description);

export const infoEmbed = (title, description) => baseEmbed(COLORS.info).setTitle(title).setDescription(description);

// Embed chi tiết 1 case (dùng cho thông báo lệnh + mod log).
export function buildCaseEmbed(caseRow, { clientId = null } = {}) {
  const meta = TYPE_META[caseRow.type] ?? TYPE_META.note;
  const moderator =
    caseRow.moderator_id === 'system' || (clientId && caseRow.moderator_id === clientId)
      ? '🤖 Hệ thống (tự động)'
      : `<@${caseRow.moderator_id}>`;

  const embed = baseEmbed(meta.color)
    .setTitle(`${meta.emoji} ${meta.label} • Case #${caseRow.case_number}`)
    .setFooter({ text: `Case #${caseRow.case_number} • User ID: ${caseRow.user_id}` })
    .setTimestamp(caseRow.created_at);

  const fields = [
    { name: 'Người dùng', value: `<@${caseRow.user_id}>`, inline: true },
    { name: 'Người thực hiện', value: moderator, inline: true },
    { name: 'Lý do', value: (caseRow.reason || 'Không có').slice(0, 1000) },
  ];
  if (caseRow.duration_ms) {
    fields.push({ name: 'Thời hạn', value: formatDuration(caseRow.duration_ms), inline: true });
  }
  if (caseRow.expires_at) {
    fields.push({
      name: 'Hết hạn',
      value: `${ts(caseRow.expires_at, 'F')} (${ts(caseRow.expires_at, 'R')})`,
      inline: true,
    });
  }
  fields.push({
    name: 'Trạng thái',
    value: caseRow.active ? '🟢 Đang hiệu lực' : '⚪ Đã kết thúc',
    inline: true,
  });
  return embed.addFields(fields);
}

// Embed cho mod log / audit log.
export function buildAuditEmbed({ title, description, color = COLORS.audit, fields = [] }) {
  const embed = baseEmbed(color).setTitle(title).setDescription(description).setTimestamp(Date.now());
  if (fields.length) embed.addFields(fields);
  return embed;
}
