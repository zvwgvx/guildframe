import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { WARNINGS_PAGE_SIZE } from '../constants.js';
import { countActiveByType, createCase, setActiveCasesStatus, listCases } from '../db.js';
import { logCase } from '../services/log.js';
import { baseEmbed, buildCaseEmbed, infoEmbed, ts } from '../utils/embeds.js';
import { paginateInteraction } from '../utils/paginate.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View or clear the warnings of a user')
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('List warnings')
      .addUserOption((o) => o.setName('user').setDescription('The user to look up').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('clear')
      .setDescription('Clear all active warnings')
      .addUserOption((o) => o.setName('user').setDescription('The user to clear').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason for clearing')),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Manage Messages'))) {
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return handleList(interaction);
  return handleClear(interaction, client);
}

async function handleList(interaction) {
  const user = interaction.options.getUser('user');
  const { total } = listCases({ guildId: interaction.guildId, userId: user.id, type: 'warn', limit: 1 });
  if (!total) {
    await interaction.editReply({ embeds: [infoEmbed('Warnings', `${user.username} has no warnings.`)] });
    return;
  }

  const totalPages = Math.ceil(total / WARNINGS_PAGE_SIZE);
  await paginateInteraction(interaction, {
    totalPages,
    render: (page) => {
      const { rows } = listCases({
        guildId: interaction.guildId,
        userId: user.id,
        type: 'warn',
        limit: WARNINGS_PAGE_SIZE,
        offset: page * WARNINGS_PAGE_SIZE,
      });
      const lines = rows.map((r) => {
        const status = r.status === 'active' ? '🟢 Active' : '⚪ Cleared';
        const reason = (r.reason || 'No reason provided').slice(0, 120);
        return `**#${r.case_number}** • ${ts(r.created_at, 'R')} • ${status} • by <@${r.moderator_id}>\n> ${reason}`;
      });
      return baseEmbed()
        .setTitle(`Warnings • ${user.username}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Page ${page + 1}/${totalPages} • Total: ${total}` })
        .setTimestamp(Date.now());
    },
  });
}

async function handleClear(interaction, client) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const activeCount = countActiveByType(interaction.guildId, user.id, 'warn');
  if (!activeCount) {
    await interaction.editReply({
      embeds: [infoEmbed('Warnings', `${user.username} has no active warnings.`)],
    });
    return;
  }

  setActiveCasesStatus(interaction.guildId, user.id, 'warn', 'removed');
  const caseRow = createCase({
    guildId: interaction.guildId,
    userId: user.id,
    moderatorId: interaction.user.id,
    type: 'note',
    reason: `Cleared ${activeCount} active warning(s)${reason ? `: ${reason}` : ''}`,
  });
  await logCase(interaction.guild, caseRow, { clientId: client.user.id });

  await interaction.editReply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
}
