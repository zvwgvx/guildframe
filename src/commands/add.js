import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { addToTicket, getTicketForChannel, isTicketStaff } from '../services/tickets.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('add')
  .setDescription('Give a user or role access to this ticket (staff or the ticket owner)')
  .addUserOption((o) => o.setName('user').setDescription('User to add to the ticket'))
  .addRoleOption((o) => o.setName('role').setDescription('Role to add to the ticket'));

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  if (!user && !role) {
    return interaction.reply({
      embeds: [errorEmbed('Pick a `user` or a `role` to add (at least one).')],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (user?.bot) {
    return interaction.reply({ embeds: [errorEmbed('Bot accounts cannot be added to tickets.')], flags: MessageFlags.Ephemeral });
  }

  const ticket = getTicketForChannel(interaction.guildId, interaction.channelId);
  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('This channel is not an open ticket.')], flags: MessageFlags.Ephemeral });
  }
  if (!isTicketStaff(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('Only ticket staff can add people to this ticket.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (user) {
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('That user is not in this server.')], flags: MessageFlags.Ephemeral });
    }
    const result = await addToTicket(interaction.guild, ticket, member, interaction.member);
    if (result?.error) {
      return interaction.reply({ embeds: [errorEmbed(result.error)], flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [successEmbed(`<@${user.id}> now has access to this ticket.`)], flags: MessageFlags.Ephemeral });
  }

  const result = await addToTicket(interaction.guild, ticket, role, interaction.member);
  if (result?.error) {
    return interaction.reply({ embeds: [errorEmbed(result.error)], flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ embeds: [successEmbed(`The role <@&${role.id}> now has access to this ticket.`)], flags: MessageFlags.Ephemeral });
}
