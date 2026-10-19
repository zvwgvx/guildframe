import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { offencesTopEmbed, offencesUserEmbed } from '../services/offencesView.js';
import { errorEmbed } from '../utils/embeds.js';
import { canSelfView, ensureModerator, selfViewDeniedText } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('offences')
  .setDescription('View offence counts - yours by default, another user, or the top 10')
  .addUserOption((o) => o.setName('user').setDescription('The user to look up (omit: your own offences)'))
  .addBooleanOption((o) =>
    o.setName('top').setDescription('Show the top 10 offenders instead (moderators only)'),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Top 10 stays a moderator view.
  if (interaction.options.getBoolean('top')) {
    if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Manage Messages'))) {
      return;
    }
    await interaction.editReply({ embeds: [offencesTopEmbed(interaction.guildId)] });
    return;
  }

  const requestedUser = interaction.options.getUser('user');
  const lookingUpSelf = !requestedUser || requestedUser.id === interaction.user.id;

  if (lookingUpSelf) {
    if (!canSelfView(interaction.member)) {
      await interaction.editReply({ embeds: [errorEmbed(selfViewDeniedText(), 'Lookup denied')] });
      return;
    }
    await interaction.editReply({ embeds: [offencesUserEmbed(interaction.guildId, interaction.user)] });
    return;
  }

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Manage Messages'))) {
    return;
  }
  await interaction.editReply({ embeds: [offencesUserEmbed(interaction.guildId, requestedUser)] });
}
