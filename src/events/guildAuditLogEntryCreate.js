import { AuditLogEvent, Events } from 'discord.js';
import { COLORS } from '../constants.js';
import { getGuildConfig } from '../db.js';
import { sendModLog } from '../services/log.js';
import { buildAuditEmbed } from '../utils/embeds.js';

export const name = Events.GuildAuditLogEntryCreate;

// Bắt các thao tác moderation làm trực tiếp qua Discord UI (không qua bot) và ghi vào mod log.
export async function execute(entry, guild, client) {
  if (!entry || !guild) return;
  if (entry.executorId === client.user.id) return; // hành động của bot đã được log riêng

  const cfg = getGuildConfig(guild.id);
  const executor = entry.executorId ? `<@${entry.executorId}>` : 'Không rõ';
  const target = entry.targetId ? `<@${entry.targetId}> (ID: ${entry.targetId})` : '—';
  const reasonLine = entry.reason ? `\n**Lý do:** ${entry.reason}` : '';

  const base = {
    color: COLORS.audit,
    fields: [
      { name: 'Người thực hiện', value: executor, inline: true },
      { name: 'Đối tượng', value: target, inline: true },
      { name: 'Nguồn', value: 'Audit Log (thao tác thủ công)', inline: true },
    ],
  };

  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: '🔨 Ban (thao tác ngoài bot)',
          description: `${target} đã bị ban.${reasonLine}`,
        }),
      );
      break;

    case AuditLogEvent.MemberBanRemove:
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: '♻️ Unban (thao tác ngoài bot)',
          description: `${target} đã được unban.${reasonLine}`,
        }),
      );
      break;

    case AuditLogEvent.MemberKick:
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: '👢 Kick (thao tác ngoài bot)',
          description: `${target} đã bị kick.${reasonLine}`,
        }),
      );
      break;

    case AuditLogEvent.MemberUpdate: {
      const change = entry.changes.find((c) => c.key === 'communication_disabled_until');
      if (!change) break;
      const isSet = Boolean(change.new);
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: isSet ? '🕐 Timeout được áp dụng (ngoài bot)' : '🕐 Timeout được gỡ (ngoài bot)',
          description: `${target} ${isSet ? 'đã bị timeout' : 'đã được gỡ timeout'}.${reasonLine}`,
        }),
      );
      break;
    }

    case AuditLogEvent.MemberRoleUpdate: {
      if (!cfg.mute_role_id) break;
      const added = entry.changes.find(
        (c) => c.key === '$add' && Array.isArray(c.new) && c.new.some((r) => r.id === cfg.mute_role_id),
      );
      const removed = entry.changes.find(
        (c) => c.key === '$remove' && Array.isArray(c.new) && c.new.some((r) => r.id === cfg.mute_role_id),
      );
      if (!added && !removed) break;
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: added ? '🔇 Role Muted được gán thủ công' : '🔊 Role Muted được gỡ thủ công',
          description: `${target} ${added ? 'đã được gán' : 'đã được gỡ'} role <@&${cfg.mute_role_id}> (ngoài bot).`,
        }),
      );
      break;
    }

    default:
      break;
  }
}
