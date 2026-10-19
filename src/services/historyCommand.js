// Shared implementation for the /history and /punishments commands.
import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { HISTORY_PAGE_SIZE } from '../constants.js';
import { listCases } from '../db.js';
import { buildPunishmentsEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';
import { paginateInteraction } from '../utils/paginate.js';
import { canSelfView, ensureModerator, selfViewDeniedText } from '../utils/permissions.js';

const HISTORY_TYPES = ['all', 'warn', 'mute', 'kick', 'ban', 'unmute', 'unban', 'note'];
const TYPE_CHOICES = [
  { name: 'All types', value: 'all' },
  { name: 'Warnings', value: 'warn' },
  { name: 'Mutes', value: 'mute' },
  { name: 'Kicks', value: 'kick' },
  { name: 'Bans', value: 'ban' },
  { name: 'Unmutes', value: 'unmute' },
  { name: 'Unbans', value: 'unban' },
  { name: 'Notes', value: 'note' },
];

export const buildHistoryCommand = (name) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription('View the punishment history of a user (omit user to see your own)')
    .addUserOption((o) => o.setName('user').setDescription('The user to look up (omit: your own history)'))
    .addStringOption((o) =>
      o.setName('type').setDescription('Filter by case type (default: all)').addChoices(...TYPE_CHOICES),
    );

export async function executeHistory(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const requestedUser = interaction.options.getUser('user');
  const lookingUpSelf = !requestedUser || requestedUser.id === interaction.user.id;

  // Inside the muted-commands channel a muted user may look up their own history
  // without any permission. Everywhere else, members with the Member role may
  // look up themselves; other users need a moderator.
  const inMutedCmds = Boolean(
    config.mutedBotCmdsChannelId && interaction.channelId === config.mutedBotCmdsChannelId,
  );

  if (lookingUpSelf) {
    if (!canSelfView(interaction.member) && !inMutedCmds) {
      await interaction.editReply({ embeds: [errorEmbed(selfViewDeniedText(), 'Lookup denied')] });
      return;
    }
  } else if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Manage Messages'))) {
    return;
  }

  const user = requestedUser ?? interaction.user;

  const requested = (interaction.options.getString('type') ?? 'all').toLowerCase();
  const type = HISTORY_TYPES.includes(requested) ? requested : 'all';

  const { total } = listCases({ guildId: interaction.guildId, userId: user.id, type, limit: 1 });
  if (!total) {
    await interaction.editReply({
      embeds: [infoEmbed('Punishments', `No records found for ${user.username}.`)],
    });
    return;
  }

  const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);
  await paginateInteraction(interaction, {
    totalPages,
    render: (page) =>
      buildPunishmentsEmbed({
        user,
        cases: listCases({
          guildId: interaction.guildId,
          userId: user.id,
          type,
          limit: HISTORY_PAGE_SIZE,
          offset: page * HISTORY_PAGE_SIZE,
        }).rows,
        page,
        totalPages,
        total,
        guildName: interaction.guild.name,
        clientId: client.user.id,
      }),
  });
}
