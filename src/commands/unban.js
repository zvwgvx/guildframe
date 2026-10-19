import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { createCase, deactivateCases, getActiveCases } from '../db.js';
import { logCase } from '../services/log.js';
import { cancelCaseTimer } from '../services/scheduler.js';
import { buildCaseEmbed, errorEmbed } from '../utils/embeds.js';
import { ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Gỡ ban cho một người dùng theo ID')
  .addStringOption((o) => o.setName('user_id').setDescription('ID người dùng đã bị ban').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Lý do unban'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.BanMembers, 'Ban thành viên'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.BanMembers, 'Ban thành viên'))) return;

  const userId = interaction.options.getString('user_id').trim();
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.editReply({ embeds: [errorEmbed('ID người dùng không hợp lệ (phải là dãy số).')] });
    return;
  }

  const existing = await interaction.guild.bans.fetch(userId).catch(() => null);
  if (!existing) {
    await interaction.editReply({ embeds: [errorEmbed(`<@${userId}> không có trong danh sách ban của server.`)] });
    return;
  }

  for (const c of getActiveCases(interaction.guildId, userId, 'ban')) cancelCaseTimer(c.id);
  deactivateCases(interaction.guildId, userId, 'ban');

  try {
    await interaction.guild.bans.remove(userId, `Unban bởi ${interaction.user.tag}${interaction.options.getString('reason') ? `: ${interaction.options.getString('reason')}` : ''}`.slice(0, 512));
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(`Không thể unban: ${err.message}`)] });
    return;
  }

  const caseRow = createCase({
    guildId: interaction.guildId,
    userId,
    moderatorId: interaction.user.id,
    type: 'unban',
    reason: interaction.options.getString('reason'),
  });
  await logCase(interaction.guild, caseRow, { clientId: client.user.id });

  await interaction.editReply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
}
