// Direct-message notices sent to members before enforced actions.
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { baseEmbed } from '../utils/embeds.js';

// DM before an enforced kick: explains the automatic action and offers a
// rejoin link. Resolves to false when the DM could not be delivered.
export async function sendKickNotice({ member, guild, caseNumber }) {
  const rejoinUrl = String(config.doNotType?.rejoinUrl ?? '').trim();
  const description = [
    `You were automatically kicked from **${guild.name}** for posting in the do-not-type channel (Case #${caseNumber}).`,
    'That channel is a trap used to detect scripted or uncontrolled accounts - messages posted there are never allowed.',
    '',
    rejoinUrl
      ? `If this was unintentional, you are welcome to return using this link: ${rejoinUrl}`
      : 'If this was unintentional, contact the staff team to be re-invited.',
  ].join('\n');

  const embed = baseEmbed(COLORS.warn)
    .setTitle('Kick Notice')
    .setDescription(description)
    .setFooter({ text: guild.name });

  const user = member.user ?? member;
  try {
    await user.send({ embeds: [embed], allowedMentions: { users: [] } });
    return true;
  } catch (err) {
    console.error('[notices] Kick notice DM failed:', err.message);
    return false;
  }
}
