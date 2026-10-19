import { Events } from 'discord.js';
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { getActiveCases } from '../db.js';
import { ensureMuteRole } from '../services/mutes.js';
import { sendModLog } from '../services/log.js';
import { buildAuditEmbed } from '../utils/embeds.js';

export const name = Events.GuildMemberAdd;

// Assigns the member (verified) role to new joins and re-applies an active mute on rejoin.
export async function execute(member, client) {
  if (member.guild.id !== config.guildId) return;

  // Bots role for bot accounts, Member role for humans.
  if (member.user.bot && config.botsRoleId) {
    await member.roles.add(config.botsRoleId, 'Bots role on join').catch((err) =>
      console.error('[guildMemberAdd] Failed to add the bots role:', err.message),
    );
  } else if (config.memberRoleId && !member.user.bot) {
    await member.roles
      .add(config.memberRoleId, 'Member role on join')
      .catch((err) => console.error('[guildMemberAdd] Failed to add the member role:', err.message));
  }

  try {
    const actives = getActiveCases(member.guild.id, member.id, 'mute');
    if (!actives.length) return;

    const role = await ensureMuteRole(member.guild, { reason: 'Re-apply mute on rejoin' });
    await member.roles.add(role, `Re-apply mute - Case #${actives[0].case_number}`);
    await sendModLog(
      member.guild,
      buildAuditEmbed({
        title: 'Mute Re-applied',
        description: `<@${member.id}> rejoined while a mute case was active (Case #${actives[0].case_number}). The <@&${role.id}> role has been assigned again.`,
        color: COLORS.mute,
      }),
    );
  } catch (err) {
    console.error('[guildMemberAdd] Failed to re-apply the mute:', err);
  }
}
