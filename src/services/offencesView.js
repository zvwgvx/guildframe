// Shared offences UI used by /offences (slash) and =offences (prefix) so both look identical.
import { TYPE_META } from '../constants.js';
import { getActiveCases, offenceBreakdown, topOffenders } from '../db.js';
import { baseEmbed, infoEmbed, ts } from '../utils/embeds.js';

// Offence breakdown for a single user as a field-style embed.
export function offencesUserEmbed(guildId, user) {
  const rows = offenceBreakdown(guildId, user.id);
  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  const lastAt = rows.reduce((max, r) => Math.max(max, r.last_at ?? 0), 0);

  const activeWarns = getActiveCases(guildId, user.id, 'warn');
  const activeMutes = getActiveCases(guildId, user.id, 'mute');
  const activeBans = getActiveCases(guildId, user.id, 'ban');

  const embed = baseEmbed().setTitle(`Offences • ${user.username}`);
  embed.addFields(
    { name: 'Total offences', value: String(total), inline: true },
    { name: 'Active warnings', value: String(activeWarns.length), inline: true },
    {
      name: 'Active mute',
      value: activeMutes.length ? `Yes (Case #${activeMutes[0].case_number})` : 'No',
      inline: true,
    },
    {
      name: 'Active ban',
      value: activeBans.length ? `Yes (Case #${activeBans[0].case_number})` : 'No',
      inline: true,
    },
  );
  if (lastAt) embed.addFields({ name: 'Latest offence', value: ts(lastAt, 'F'), inline: true });

  const breakdown = rows
    .map((r) => `${TYPE_META[r.type]?.label ?? r.type}: **${r.count}**`)
    .join('\n');
  embed.addFields({ name: 'Breakdown', value: breakdown || 'None' });

  return embed;
}

// Top 10 offenders embed, or an "empty" info embed when nothing is recorded yet.
export function offencesTopEmbed(guildId) {
  const rows = topOffenders(guildId, 10);
  if (!rows.length) return infoEmbed('Offences', 'No offences recorded yet.');
  const lines = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> - **${r.count}** offence(s)`);
  return baseEmbed().setTitle('Top 10 offenders').setDescription(lines.join('\n'));
}
