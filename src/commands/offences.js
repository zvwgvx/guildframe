import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { TYPE_META } from '../constants.js';
import {
  countActiveByType,
  getActiveCases,
  getGuildConfig,
  offenceBreakdown,
  topOffenders,
} from '../db.js';
import { baseEmbed, infoEmbed, ts } from '../utils/embeds.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('offences')
  .setDescription('Xem offence count (điểm vi phạm) của một người dùng hoặc bảng xếp hạng')
  .addUserOption((o) => o.setName('user').setDescription('Người dùng cần xem (bỏ trống = top 10)'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Quản lý tin nhắn'))) {
    return;
  }

  const user = interaction.options.getUser('user');
  if (!user) return showTop(interaction);
  return showUser(interaction, user);
}

async function showUser(interaction, user) {
  const guildId = interaction.guildId;
  const rows = offenceBreakdown(guildId, user.id);
  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  const lastAt = rows.reduce((max, r) => Math.max(max, r.last_at ?? 0), 0);

  const activeWarns = countActiveByType(guildId, user.id, 'warn');
  const activeMutes = getActiveCases(guildId, user.id, 'mute');
  const activeBans = getActiveCases(guildId, user.id, 'ban');
  const cfg = getGuildConfig(guildId);

  const embed = baseEmbed().setTitle(`📊 Điểm vi phạm — ${user.username}`);
  embed.addFields({ name: 'Tổng vi phạm', value: String(total), inline: true });
  embed.addFields({ name: 'Cảnh cáo đang hiệu lực', value: String(activeWarns), inline: true });
  embed.addFields({
    name: 'Mute đang hiệu lực',
    value: activeMutes.length ? `Có (Case #${activeMutes[0].case_number})` : 'Không',
    inline: true,
  });
  embed.addFields({
    name: 'Ban đang hiệu lực',
    value: activeBans.length ? `Có (Case #${activeBans[0].case_number})` : 'Không',
    inline: true,
  });
  if (lastAt) embed.addFields({ name: 'Vi phạm gần nhất', value: ts(lastAt, 'F'), inline: true });
  if (cfg.warn_threshold > 0) {
    embed.addFields({ name: 'Ngưỡng auto-mute', value: `${cfg.warn_threshold} cảnh cáo`, inline: true });
  }

  const breakdown = rows
    .map((r) => {
      const meta = TYPE_META[r.type] ?? TYPE_META.note;
      return `${meta.emoji} ${meta.label}: **${r.count}**`;
    })
    .join('\n');
  embed.addFields({ name: 'Chi tiết theo loại', value: breakdown || 'Không có' });

  await interaction.editReply({ embeds: [embed] });
}

async function showTop(interaction) {
  const rows = topOffenders(interaction.guildId, 10);
  if (!rows.length) {
    await interaction.editReply({ embeds: [infoEmbed('📊 Bảng xếp hạng vi phạm', 'Server chưa có vi phạm nào.')] });
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map(
    (r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.user_id}> — **${r.count}** vi phạm`,
  );
  await interaction.editReply({
    embeds: [baseEmbed().setTitle('📊 Top 10 vi phạm').setDescription(lines.join('\n'))],
  });
}
