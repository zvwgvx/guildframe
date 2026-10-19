import { Events, MessageFlags } from 'discord.js';
import { errorEmbed } from '../utils/embeds.js';
import { isConfiguredGuild } from '../utils/permissions.js';

export const name = Events.InteractionCreate;

export async function execute(interaction, client) {
  if (!interaction.inGuild() || !isConfiguredGuild(interaction.guildId)) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: 'This bot is not configured for this server.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  // Display-only counter buttons on the do-not-type warning message.
  if (interaction.isButton() && interaction.customId.startsWith('trap_stat_')) {
    const key = interaction.customId.replace('trap_stat_', '');
    await interaction
      .reply({ content: 'This counter is display-only.', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`[command:${interaction.commandName}]`, err);
    const embed = errorEmbed('Something went wrong while running this command. Check the bot logs for details.');
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [embed] });
      else await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch {
      // interaction already expired
    }
  }
}
