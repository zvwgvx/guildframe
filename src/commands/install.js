import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { buildSetupSummaryEmbed, runInstall } from '../services/install.js';
import { ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('install')
  .setDescription('Check every configured role/channel, apply the setup and post the setup messages');

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageGuild, 'Manage Server'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.ManageRoles, 'Manage Roles'))) return;

  const results = await runInstall(client, interaction.guild, { installerId: interaction.user.id });
  const failures = results.filter((r) => r.status === 'Failed').length;

  await interaction.editReply({
    embeds: [
      buildSetupSummaryEmbed(results, {
        title: 'Install',
        description: failures
          ? 'Setup finished with issues - check the entries below.'
          : 'Setup complete. The setup messages were posted/refreshed in the configured channels.',
      }),
    ],
  });
}
