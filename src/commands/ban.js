import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { MAX_BAN_MS } from '../constants.js';
import { createCase, getActiveCases, hideCase } from '../db.js';
import { logCase } from '../services/log.js';
import { scheduleCase } from '../services/scheduler.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { buildCaseEmbed, errorEmbed, ts } from '../utils/embeds.js';
import { canModerateMember, ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban một người dùng (hỗ trợ temp ban kèm thời hạn)')
  .addUserOption((o) => o.setName('user').setDescription('Người dùng cần ban').setRequired(true))
  .addStringOption((o) => o.setName('duration').setDescription('Thời hạn: 1d, 7d, 30d... Bỏ trống = ban vĩnh viễn'))
  .addStringOption((o) => o.setName('reason').setDescription('Lý do ban'))
  .addIntegerOption((o) =>
    o
      .setName('delete_messages')
      .setDescription('Xóa tin nhắn gần đây của người này')
      .addChoices(
        { name: 'Không xóa', value: 0 },
        { name: '1 giờ', value: 3600 },
        { name: '6 giờ', value: 21600 },
        { name: '24 giờ', value: 86400 },
      ),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.BanMembers, 'Ban thành viên'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.BanMembers, 'Ban thành viên'))) return;

  const user = interaction.options.getUser('user');
  if (user.id === client.user.id) {
    await interaction.editReply({ embeds: [errorEmbed('Không thể tự ban chính mình.')] });
    return;
  }

  const member = interaction.options.getMember('user');
  if (member && !(await canModerateMember(interaction, member))) return;

  const existing = await interaction.guild.bans.fetch(user.id).catch(() => null);
  if (existing) {
    await interaction.editReply({ embeds: [errorEmbed(`${user} đã bị ban từ trước.`)] });
    return;
  }

  const durationInput = interaction.options.getString('duration');
  let durationMs;
  try {
    durationMs = parseDuration(durationInput);
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    return;
  }
  if (durationMs && durationMs > MAX_BAN_MS) {
    await interaction.editReply({
      embeds: [errorEmbed(`Thời hạn ban tối đa là ${formatDuration(MAX_BAN_MS)}.`)],
    });
    return;
  }

  const reason = interaction.options.getString('reason');
  const deleteMessageSeconds = interaction.options.getInteger('delete_messages') ?? 0;
  const caseRow = createCase({
    guildId: interaction.guildId,
    userId: user.id,
    moderatorId: interaction.user.id,
    type: 'ban',
    reason,
    durationMs,
  });

  try {
    await interaction.guild.bans.create(user.id, {
      deleteMessageSeconds,
      reason: `Case #${caseRow.case_number} bởi ${interaction.user.tag}${reason ? `: ${reason}` : ''}`.slice(0, 512),
    });
  } catch (err) {
    hideCase(caseRow.id);
    await interaction.editReply({ embeds: [errorEmbed(`Không thể ban: ${err.message}`)] });
    return;
  }

  if (durationMs) scheduleCase(caseRow.id);
  await logCase(interaction.guild, caseRow, { clientId: client.user.id });

  const embed = buildCaseEmbed(caseRow, { clientId: client.user.id });
  if (caseRow.expires_at) {
    embed.addFields({ name: '⏳ Tự động unban', value: ts(caseRow.expires_at, 'R'), inline: true });
  }
  await interaction.editReply({ embeds: [embed] });
}
