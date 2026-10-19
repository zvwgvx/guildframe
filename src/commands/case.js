import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { createCase, getCaseByNumber, hideCase } from '../db.js';
import { logCase } from '../services/log.js';
import { buildCaseEmbed, errorEmbed } from '../utils/embeds.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('Xem hoặc xóa một case theo số')
  .addSubcommand((s) =>
    s
      .setName('view')
      .setDescription('Xem chi tiết một case')
      .addIntegerOption((o) => o.setName('number').setDescription('Số case').setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName('delete')
      .setDescription('Ẩn một case khỏi lịch sử (vẫn giữ audit trail)')
      .addIntegerOption((o) => o.setName('number').setDescription('Số case').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('reason').setDescription('Lý do xóa')),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === 'view') {
    if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Quản lý tin nhắn'))) return;

    const caseRow = getCaseByNumber(interaction.guildId, interaction.options.getInteger('number'));
    if (!caseRow || caseRow.hidden) {
      await interaction.editReply({ embeds: [errorEmbed('Case này không tồn tại.')] });
      return;
    }
    await interaction.editReply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
    return;
  }

  // delete
  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageGuild, 'Quản lý server'))) return;

  const caseRow = getCaseByNumber(interaction.guildId, interaction.options.getInteger('number'));
  if (!caseRow || caseRow.hidden) {
    await interaction.editReply({ embeds: [errorEmbed('Case này không tồn tại.')] });
    return;
  }

  hideCase(caseRow.id);
  const reason = interaction.options.getString('reason');
  const noteCase = createCase({
    guildId: interaction.guildId,
    userId: caseRow.user_id,
    moderatorId: interaction.user.id,
    type: 'note',
    reason: `Xóa Case #${caseRow.case_number} (${caseRow.type}) khỏi lịch sử${reason ? `: ${reason}` : ''}`,
  });
  await logCase(interaction.guild, noteCase, { clientId: client.user.id });

  await interaction.editReply({
    embeds: [buildCaseEmbed(noteCase, { clientId: client.user.id })],
  });
}
