import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { countActiveByType, getActiveCases, offenceBreakdown, topOffenders } from '../db.js';
import { baseEmbed, infoEmbed, ts } from '../utils/embeds.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('offences')
  .setDescription('View the offence count of a user, or the top 10 offenders')
  .addUserOption((o) => o.setName('user').setDescription('The user to look up (omit for the top 10)'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Manage Messages'))) {
    return;
  }

  const user = interaction.options.getUser('user');
  if (!user) return showTop(interaction);
  return showUser(interaction, user);
}

async function showUser(interaction, user) {
  const guildId = interaction.guildId;
  const rows = offenceBreakdown(guildId, user.id);
  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  const lastAt = rows.reduce((max, r) => Math.max(max, r.last_at ?? 0), 0);

  const activeWarns = countActiveByType(guildId, user.id, 'warn');
  const activeMutes = getActiveCases(guildId, user.id, 'mute');
  const activeBans = getActiveCases(guildId, user.id, 'ban');

  const embed = baseEmbed().setTitle(`Offences • ${user.username}`);
  embed.addFields(
    { name: 'Total offences', value: String(total), inline: true },
    { name: 'Active warnings', value: String(activeWarns), inline: true },
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

  const breakdown = rows.map((r) => `${r.type}: **${r.count}**`).join('\n');
  embed.addFields({ name: 'Breakdown', value: breakdown || 'None' });

  await interaction.editReply({ embeds: [embed] });
}

async function showTop(interaction) {
  const rows = topOffenders(interaction.guildId, 10);
  if (!rows.length) {
    await interaction.editReply({ embeds: [infoEmbed('Offences', 'No offences recorded yet.')] });
    return;
  }
  const lines = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> - **${r.count}** offence(s)`);
  await interaction.editReply({
    embeds: [baseEmbed().setTitle('Top 10 offenders').setDescription(lines.join('\n'))],
  });
}
