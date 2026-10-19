import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getTicketForChannel, isTicketStaff, removeFromTicket } from '../services/tickets.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Revoke a user or role access to this ticket (staff or the ticket owner)')
  .addUserOption((o) => o.setName('user').setDescription('User to remove from the ticket'))
  .addRoleOption((o) => o.setName('role').setDescription('Role to remove from the ticket'));

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  if (!user && !role) {
    return interaction.reply({
      embeds: [errorEmbed('Pick a `user` or a `role` to remove (at least one).')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const ticket = getTicketForChannel(interaction.guildId, interaction.channelId);
  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('This channel is not an open ticket.')], flags: MessageFlags.Ephemeral });
  }
  if (!isTicketStaff(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('Only ticket staff can remove access from this ticket.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (user) {
    if (user.id === ticket.owner_id) {
      return interaction.reply({ embeds: [errorEmbed('The ticket owner cannot be removed from their own ticket.')], flags: MessageFlags.Ephemeral });
    }
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const result = await removeFromTicket(interaction.guild, ticket, member ?? user, interaction.member);
    if (result?.error) {
      return interaction.reply({ embeds: [errorEmbed(result.error)], flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [successEmbed(`<@${user.id}> no longer has access to this ticket.`)], flags: MessageFlags.Ephemeral });
  }

  const result = await removeFromTicket(interaction.guild, ticket, role, interaction.member);
  if (result?.error) {
    return interaction.reply({ embeds: [errorEmbed(result.error)], flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({
    embeds: [successEmbed(`The role <@&${role.id}> no longer has access to this ticket.`)],
    flags: MessageFlags.Ephemeral,
  });
}
