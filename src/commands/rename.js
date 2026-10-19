import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getTicketForChannel, canManageTicket, renameTicket } from '../services/tickets.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('rename')
  .setDescription('Rename this ticket channel (staff or the ticket owner)')
  .addStringOption((o) =>
    o.setName('name').setDescription('New name (the ticket- prefix is added automatically)').setRequired(true).setMaxLength(90),
  );

export async function execute(interaction) {
  const ticket = getTicketForChannel(interaction.guildId, interaction.channelId);
  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('This channel is not an open ticket.')], flags: MessageFlags.Ephemeral });
  }
  if (!canManageTicket(ticket, interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('Only the ticket owner or staff can rename this ticket.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const name = interaction.options.getString('name').trim();
  const result = await renameTicket(interaction.guild, ticket, name, interaction.member);
  const embed = result?.error ? errorEmbed(result.error) : successEmbed(`Ticket renamed.`);

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
