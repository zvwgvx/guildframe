import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { HISTORY_PAGE_SIZE, TYPE_META } from '../constants.js';
import { listCases } from '../db.js';
import { baseEmbed, infoEmbed, ts } from '../utils/embeds.js';
import { paginate } from '../utils/paginate.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('Xem lịch sử punishment của một người dùng')
  .addUserOption((o) => o.setName('user').setDescription('Người dùng cần tra cứu').setRequired(true))
  .addStringOption((o) =>
    o
      .setName('type')
      .setDescription('Lọc theo loại (mặc định: tất cả)')
      .addChoices(
        { name: 'Tất cả', value: 'all' },
        { name: 'Cảnh cáo', value: 'warn' },
        { name: 'Mute', value: 'mute' },
        { name: 'Kick', value: 'kick' },
        { name: 'Ban', value: 'ban' },
        { name: 'Unmute', value: 'unmute' },
        { name: 'Unban', value: 'unban' },
        { name: 'Ghi chú', value: 'note' },
      ),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Quản lý tin nhắn'))) {
    return;
  }

  const user = interaction.options.getUser('user');
  const type = interaction.options.getString('type') ?? 'all';

  const { total } = listCases({ guildId: interaction.guildId, userId: user.id, type, limit: 1 });
  if (!total) {
    await interaction.editReply({
      embeds: [infoEmbed('📜 Lịch sử punishment', `${user} chưa có bản ghi nào.`)],
    });
    return;
  }

  const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);
  await paginate(interaction, {
    totalPages,
    render: (page) => {
      const { rows } = listCases({
        guildId: interaction.guildId,
        userId: user.id,
        type,
        limit: HISTORY_PAGE_SIZE,
        offset: page * HISTORY_PAGE_SIZE,
      });
      const lines = rows.map((r) => {
        const meta = TYPE_META[r.type] ?? TYPE_META.note;
        const mod = r.moderator_id === client.user.id ? '🤖 Hệ thống' : `<@${r.moderator_id}>`;
        const expiry = r.expires_at ? ` • hết hạn ${ts(r.expires_at, 'R')}` : '';
        const status = r.active ? '🟢' : '⚪';
        const reason = (r.reason || 'Không có lý do').slice(0, 120);
        return `**#${r.case_number}** ${meta.emoji} ${meta.label} ${status} • ${ts(r.created_at, 'R')} • bởi ${mod}${expiry}\n> ${reason}`;
      });
      return baseEmbed()
        .setTitle(`📜 Lịch sử punishment — ${user.username}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Trang ${page + 1}/${totalPages} • Tổng ${total} case` });
    },
  });
}
