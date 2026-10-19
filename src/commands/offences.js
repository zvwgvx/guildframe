import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { offencesTopEmbed, offencesUserEmbed } from '../services/offencesView.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('offences')
  .setDescription('View the offence count of a user, or the top 10 offenders')
  .addUserOption((o) => o.setName('user').setDescription('The user to look up (omit for the top 10)'));

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Manage Messages'))) {
    return;
  }

  const user = interaction.options.getUser('user');
  if (!user) {
    await interaction.editReply({ embeds: [offencesTopEmbed(interaction.guildId)] });
    return;
  }
  await interaction.editReply({ embeds: [offencesUserEmbed(interaction.guildId, user)] });
}
