import { AuditLogEvent, Events } from 'discord.js';
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { sendModLog } from '../services/log.js';
import { buildAuditEmbed } from '../utils/embeds.js';

export const name = Events.GuildAuditLogEntryCreate;

// Catches moderation actions performed directly through the Discord client (out of band) and logs them.
export async function execute(entry, guild, client) {
  if (!entry || !guild || guild.id !== config.guildId) return;
  if (entry.executorId === client.user.id) return; // bot actions are logged separately

  const executor = entry.executorId ? `<@${entry.executorId}>` : 'Unknown';
  const target = entry.targetId ? `<@${entry.targetId}> (ID: ${entry.targetId})` : '-';
  const reasonLine = entry.reason ? `\n**Reason:** ${entry.reason}` : '';

  const base = {
    color: COLORS.audit,
    fields: [
      { name: 'Executor', value: executor, inline: true },
      { name: 'Target', value: target, inline: true },
      { name: 'Source', value: 'Audit Log (out of band)', inline: true },
    ],
  };

  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: 'Ban (out of band)',
          description: `${target} was banned.${reasonLine}`,
        }),
      );
      break;

    case AuditLogEvent.MemberBanRemove:
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: 'Unban (out of band)',
          description: `${target} was unbanned.${reasonLine}`,
        }),
      );
      break;

    case AuditLogEvent.MemberKick:
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: 'Kick (out of band)',
          description: `${target} was kicked.${reasonLine}`,
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
          title: isSet ? 'Timeout applied (out of band)' : 'Timeout removed (out of band)',
          description: `${target} ${isSet ? 'was timed out' : 'had their timeout removed'}.${reasonLine}`,
        }),
      );
      break;
    }

    case AuditLogEvent.MemberRoleUpdate: {
      if (!config.muteRoleId) break;
      const added = entry.changes.find(
        (c) => c.key === '$add' && Array.isArray(c.new) && c.new.some((r) => r.id === config.muteRoleId),
      );
      const removed = entry.changes.find(
        (c) => c.key === '$remove' && Array.isArray(c.new) && c.new.some((r) => r.id === config.muteRoleId),
      );
      if (!added && !removed) break;
      await sendModLog(
        guild,
        buildAuditEmbed({
          ...base,
          title: added ? 'Muted role added manually' : 'Muted role removed manually',
          description: `${target} had the <@&${config.muteRoleId}> role ${added ? 'added' : 'removed'} (out of band).`,
        }),
      );
      break;
    }

    default:
      break;
  }
}
