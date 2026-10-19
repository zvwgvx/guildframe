import { Events } from 'discord.js';
import { COLORS } from '../constants.js';
import { getActiveCases } from '../db.js';
import { ensureMuteRole } from '../services/mutes.js';
import { sendModLog } from '../services/log.js';
import { buildAuditEmbed } from '../utils/embeds.js';

export const name = Events.GuildMemberAdd;

// Nếu thành viên quay lại server trong lúc còn case mute đang hiệu lực -> mute lại.
export async function execute(member, client) {
  try {
    const actives = getActiveCases(member.guild.id, member.id, 'mute');
    if (!actives.length) return;

    const role = await ensureMuteRole(member.guild, { reason: 'Tự động mute lại khi thành viên quay lại' });
    await member.roles.add(role, `Tự động mute lại — Case #${actives[0].case_number}`);
    await sendModLog(
      member.guild,
      buildAuditEmbed({
        title: '🔁 Tự động mute lại',
        description: `<@${member.id}> quay lại server trong lúc còn case mute đang hiệu lực (Case #${actives[0].case_number}). Đã gán lại role <@&${role.id}>.`,
        color: COLORS.mute,
      }),
    );
  } catch (err) {
    console.error('[guildMemberAdd] Không mute lại được:', err);
  }
}
