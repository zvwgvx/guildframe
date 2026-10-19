import { Events, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { isConfiguredGuild } from '../utils/permissions.js';
import { TICKET_BUTTON_ID, openTicket } from '../services/tickets.js';

export const name = Events.InteractionCreate;

export async function execute(interaction, client) {
  if (!interaction.inGuild() || !isConfiguredGuild(interaction.guildId)) {
    if (interaction.isRepliable()) {
      const reason = config.guildId
        ? `This bot only operates in the configured server (ID: ${config.guildId}).`
        : 'Open config.json, set `guildId` to your server ID, then restart the bot.';
      await interaction
        .reply({
          embeds: [
            errorEmbed(reason, 'Bot not configured for this server'),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }
    return;
  }

  // The single "Open Ticket" button on the ticket panel.
  if (interaction.isButton() && interaction.customId === TICKET_BUTTON_ID) {
    const result = await openTicket(interaction, client).catch((err) => {
      console.error('[tickets] Open failed:', err.message);
      return { error: 'Opening the ticket failed. Try again in a moment.' };
    });
    const embed = result?.error ? errorEmbed(result.error) : successEmbed(`Ticket created: <#${result.channel.id}>`);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
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
