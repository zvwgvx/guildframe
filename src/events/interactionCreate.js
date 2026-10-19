import { Events, MessageFlags } from 'discord.js';
import { errorEmbed } from '../utils/embeds.js';
import { isConfiguredGuild } from '../utils/permissions.js';

export const name = Events.InteractionCreate;

export async function execute(interaction, client) {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.inGuild() || !isConfiguredGuild(interaction.guildId)) {
    await interaction.reply({
      content: 'This bot is not configured for this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
