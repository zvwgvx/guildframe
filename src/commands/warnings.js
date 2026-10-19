import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { WARNINGS_PAGE_SIZE } from '../constants.js';
import { countActiveByType, createCase, deactivateCases, listCases } from '../db.js';
import { logCase } from '../services/log.js';
import { baseEmbed, buildCaseEmbed, infoEmbed, ts } from '../utils/embeds.js';
import { paginate } from '../utils/paginate.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('Xem / xóa cảnh cáo của một người dùng')
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('Danh sách cảnh cáo')
      .addUserOption((o) => o.setName('user').setDescription('Người dùng cần xem').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('clear')
      .setDescription('Xóa toàn bộ cảnh cáo đang hiệu lực')
      .addUserOption((o) => o.setName('user').setDescription('Người dùng cần xóa cảnh cáo').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Lý do xóa')),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Quản lý tin nhắn'))) {
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return handleList(interaction, client);
  return handleClear(interaction, client);
}

async function handleList(interaction, client) {
  const user = interaction.options.getUser('user');
  const { total } = listCases({
    guildId: interaction.guildId,
    userId: user.id,
    type: 'warn',
    limit: 1,
  });
  if (!total) {
    await interaction.editReply({ embeds: [infoEmbed('⚠️ Cảnh cáo', `${user} chưa có cảnh cáo nào.`)] });
    return;
  }

  const totalPages = Math.ceil(total / WARNINGS_PAGE_SIZE);
  await paginate(interaction, {
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
        const status = r.active ? '' : ' • ⚪ đã xóa';
        const reason = (r.reason || 'Không có lý do').slice(0, 120);
        return `**#${r.case_number}** ${ts(r.created_at, 'R')} • bởi <@${r.moderator_id}>${status}\n> ${reason}`;
      });
      return baseEmbed()
        .setTitle(`⚠️ Cảnh cáo — ${user.username}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Trang ${page + 1}/${totalPages} • Tổng ${total} cảnh cáo` });
    },
  });
}

async function handleClear(interaction, client) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const activeCount = countActiveByType(interaction.guildId, user.id, 'warn');
  if (!activeCount) {
    await interaction.editReply({
      embeds: [infoEmbed('⚠️ Cảnh cáo', `${user} không có cảnh cáo nào đang hiệu lực.`)],
    });
    return;
  }

  deactivateCases(interaction.guildId, user.id, 'warn');
  const caseRow = createCase({
    guildId: interaction.guildId,
    userId: user.id,
    moderatorId: interaction.user.id,
    type: 'note',
    reason: `Xóa ${activeCount} cảnh cáo đang hiệu lực${reason ? `: ${reason}` : ''}`,
  });
  await logCase(interaction.guild, caseRow, { clientId: client.user.id });

  await interaction.editReply({
    embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })],
  });
}
