import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { createCase, hideCase } from '../db.js';
import { applyMute } from '../services/mutes.js';
import { logCase, sendModLog } from '../services/log.js';
import { onTrapCaught } from '../services/trap.js';
import { buildAuditEmbed, truncate } from '../utils/embeds.js';

// Handles messages posted in the "do not type" channel (used to catch bots/selfbots).
// config.doNotType.action: "alert" (default) | "mute" | "kick" | "ban".
export async function handleDoNotType(message, client) {
  const guild = message.guild;
  const isBotAuthor = message.author.bot;
  const configuredAction = String(config.doNotType?.action ?? 'alert').toLowerCase();
  const action = !isBotAuthor && ['mute', 'kick', 'ban'].includes(configuredAction) ? configuredAction : 'alert';

  const fields = [
    { name: 'Author', value: `${message.author} (${message.author.id})`, inline: true },
    { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
  ];
  const preview = message.content ? `> ${truncate(message.content, 500)}` : '(no text content)';
  const description = [
    `<@${message.author.id}> posted a message in the do-not-type channel.`,
    preview,
    `[Jump to message](${message.url})`,
  ].join('\n');

  // Optional automatic action (skipped for real bot accounts - alert only).
  if (action !== 'alert') {
    try {
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (action === 'mute' && member) {
        const { caseRow } = await applyMute(guild, member, {
          moderatorId: client.user.id,
          reason: 'Posted in the do-not-type channel',
          durationMs: null,
          clientId: client.user.id,
        });
        fields.push({ name: 'Action', value: `Muted (Case #${caseRow.case_number})`, inline: true });
      } else if (action === 'kick' && member) {
        const caseRow = createCase({
          guildId: guild.id,
          userId: member.id,
          moderatorId: client.user.id,
          type: 'kick',
          reason: 'Posted in the do-not-type channel',
        });
        await member.kick(`Case #${caseRow.case_number} | Posted in the do-not-type channel`);
        await logCase(guild, caseRow, { clientId: client.user.id });
        fields.push({ name: 'Action', value: `Kicked (Case #${caseRow.case_number})`, inline: true });
      } else if (action === 'ban') {
        const caseRow = createCase({
          guildId: guild.id,
          userId: message.author.id,
          moderatorId: client.user.id,
          type: 'ban',
          reason: 'Posted in the do-not-type channel',
        });
        try {
          await guild.bans.create(message.author.id, {
            reason: `Case #${caseRow.case_number} | Posted in the do-not-type channel`,
          });
        } catch (err) {
          hideCase(caseRow.id);
          throw err;
        }
        await logCase(guild, caseRow, { clientId: client.user.id });
        fields.push({ name: 'Action', value: `Banned (Case #${caseRow.case_number})`, inline: true });
      }
    } catch (err) {
      console.error('[doNotType] Automatic action failed:', err.message);
      fields.push({ name: 'Action', value: `Failed: ${err.message}`, inline: true });
    }
  }

  const content = config.modRoleId ? `<@&${config.modRoleId}>` : undefined;
  await sendModLog(
    guild,
    buildAuditEmbed({
      title: 'Do-Not-Type Channel Alert',
      description,
      color: COLORS.error,
      fields,
    }),
    { content },
  );

  // Update the persistent warning message counters.
  await onTrapCaught(message, action, client);
}
