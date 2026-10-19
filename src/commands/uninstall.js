import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { buildSetupSummaryEmbed, runUninstall } from '../services/install.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('uninstall')
  .setDescription('Delete the setup messages the bot posted in channels (Warning message, muted-commands notice)');

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageGuild, 'Manage Server'))) return;

  const results = await runUninstall(client, interaction.guild);

  await interaction.editReply({
    embeds: [
      buildSetupSummaryEmbed(results, {
        title: 'Uninstall',
        description: 'Setup messages were removed. Run /install to post them again.',
      }),
    ],
  });
}
