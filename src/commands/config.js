import { ChannelType, MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../db.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { baseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Cấu hình bot cho server này')
  .addSubcommand((s) => s.setName('show').setDescription('Xem cấu hình hiện tại'))
  .addSubcommand((s) =>
    s
      .setName('set-log')
      .setDescription('Đặt kênh nhận mod log')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Kênh nhận log')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('set-mute-role')
      .setDescription('Dùng một role có sẵn làm role Muted')
      .addRoleOption((o) => o.setName('role').setDescription('Role sẽ dùng để mute').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('set-mod-role')
      .setDescription('Role được phép dùng các lệnh moderation')
      .addRoleOption((o) => o.setName('role').setDescription('Role moderator').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('set-warn-escalation')
      .setDescription('Cấu hình tự động mute khi đủ ngưỡng cảnh cáo')
      .addIntegerOption((o) =>
        o
          .setName('threshold')
          .setDescription('Số cảnh cáo đang hiệu lực để auto-mute (0 = tắt)')
          .setMinValue(0)
          .setMaxValue(20)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('duration').setDescription('Thời hạn mute tự động: 1h, 1d... Mặc định 1h'),
      ),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageGuild, 'Quản lý server'))) return;

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'show') {
    const cfg = getGuildConfig(guildId);
    const embed = baseEmbed()
      .setTitle('⚙️ Cấu hình server')
      .addFields(
        { name: 'Kênh mod log', value: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : '— Chưa đặt', inline: true },
        { name: 'Role Muted', value: cfg.mute_role_id ? `<@&${cfg.mute_role_id}>` : '— Chưa đặt', inline: true },
        { name: 'Role moderator', value: cfg.mod_role_id ? `<@&${cfg.mod_role_id}>` : '— Chưa đặt', inline: true },
        {
          name: 'Auto-mute theo cảnh cáo',
          value:
            cfg.warn_threshold > 0
              ? `${cfg.warn_threshold} cảnh cáo → mute ${formatDuration(cfg.warn_mute_ms)}`
              : '— Đang tắt',
        },
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'set-log') {
    const channel = interaction.options.getChannel('channel');
    updateGuildConfig(guildId, { log_channel_id: channel.id });
    await interaction.editReply({
      embeds: [successEmbed(`Đã đặt kênh mod log: <#${channel.id}>.\nHãy chắc chắn bot có quyền **Gửi tin nhắn** + **Nhúng liên kết** trong kênh này.`)],
    });
    return;
  }

  if (sub === 'set-mute-role') {
    const role = interaction.options.getRole('role');
    const me = interaction.guild.members.me;
    if (role.managed || role.id === interaction.guild.id) {
      await interaction.editReply({ embeds: [errorEmbed('Role này không thể dùng để mute.')] });
      return;
    }
    if (role.position >= me.roles.highest.position) {
      await interaction.editReply({
        embeds: [errorEmbed('Role này cao hơn hoặc bằng role cao nhất của bot, bot không thể gán role đó.')],
      });
      return;
    }
    updateGuildConfig(guildId, { mute_role_id: role.id });
    await interaction.editReply({
      embeds: [
        successEmbed(
          `Đã đặt <@&${role.id}> làm role Muted.\nChạy lại **/setup** để bot đồng bộ chặn quyền trên toàn bộ kênh.`,
        ),
      ],
    });
    return;
  }

  if (sub === 'set-mod-role') {
    const role = interaction.options.getRole('role');
    updateGuildConfig(guildId, { mod_role_id: role.id });
    await interaction.editReply({
      embeds: [successEmbed(`<@&${role.id}> giờ có thể dùng các lệnh moderation (ngoài người có quyền Discord sẵn).`)],
    });
    return;
  }

  // set-warn-escalation
  const threshold = interaction.options.getInteger('threshold');
  const durationInput = interaction.options.getString('duration');
  let warnMuteMs = getGuildConfig(guildId).warn_mute_ms;
  if (durationInput) {
    try {
      const parsed = parseDuration(durationInput);
      if (parsed) warnMuteMs = parsed;
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
      return;
    }
  }
  updateGuildConfig(guildId, { warn_threshold: threshold, warn_mute_ms: warnMuteMs });
  await interaction.editReply({
    embeds: [
      successEmbed(
        threshold > 0
          ? `Đã bật auto-mute: đạt **${threshold} cảnh cáo** đang hiệu lực → mute **${formatDuration(warnMuteMs)}**.`
          : 'Đã tắt auto-mute theo cảnh cáo.',
      ),
    ],
  });
}
