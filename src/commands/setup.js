import { ChannelType, MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { getGuildConfig, updateGuildConfig } from '../db.js';
import { applyMuteOverwritesAll, ensureMuteRole } from '../services/mutes.js';
import { successEmbed } from '../utils/embeds.js';
import { ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Thiết lập bot: tạo role Muted + chặn quyền trên toàn bộ kênh + đặt kênh log')
  .addChannelOption((o) =>
    o
      .setName('log_channel')
      .setDescription('Kênh nhận mod log (tuỳ chọn)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageGuild, 'Quản lý server'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.ManageRoles, 'Quản lý Roles'))) return;

  const guild = interaction.guild;
  const role = await ensureMuteRole(guild, { reason: `Setup bởi ${interaction.user.tag}` });
  const { ok, failed } = await applyMuteOverwritesAll(guild, role);

  const logChannel = interaction.options.getChannel('log_channel');
  let logNote;
  if (logChannel) {
    updateGuildConfig(guild.id, { log_channel_id: logChannel.id });
    logNote = `Kênh log: <#${logChannel.id}>`;
  } else {
    const cfg = getGuildConfig(guild.id);
    if (!cfg.log_channel_id && config.defaultModLogChannelId) {
      updateGuildConfig(guild.id, { log_channel_id: config.defaultModLogChannelId });
    }
    const updated = getGuildConfig(guild.id);
    logNote = updated.log_channel_id
      ? `Kênh log: <#${updated.log_channel_id}>`
      : 'Kênh log: ⚠️ chưa đặt — dùng `/config set-log` hoặc chạy lại `/setup` kèm `log_channel`';
  }

  const lines = [
    `Role Muted: <@&${role.id}>`,
    `Đã áp chặn quyền trên **${ok}** kênh${failed ? ` (⚠️ lỗi ${failed} kênh)` : ''}.`,
    logNote,
    '',
    'Bot sẽ tự áp dụng cho kênh mới tạo. Nếu role Muted bị xóa, bot sẽ tự tạo lại khi mute.',
  ];
  if (failed) lines.push('⚠️ Một số kênh lỗi: kiểm tra bot có quyền **Quản lý Roles** và role của bot nằm trên role Muted.');

  await interaction.editReply({ embeds: [successEmbed(lines.join('\n'), '✅ Setup hoàn tất')] });
}
