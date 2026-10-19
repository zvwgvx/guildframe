import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { createCase, hideCase } from '../db.js';
import { logCase } from '../services/log.js';
import { buildCaseEmbed, errorEmbed } from '../utils/embeds.js';
import { canModerateMember, ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick một thành viên khỏi server')
  .addUserOption((o) => o.setName('user').setDescription('Thành viên cần kick').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Lý do kick'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.KickMembers, 'Kick thành viên'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.KickMembers, 'Kick thành viên'))) return;

  const member = interaction.options.getMember('user');
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed('Người dùng này không ở trong server.')] });
    return;
  }
  if (!(await canModerateMember(interaction, member))) return;

  const reason = interaction.options.getString('reason');
  const caseRow = createCase({
    guildId: interaction.guildId,
    userId: member.id,
    moderatorId: interaction.user.id,
    type: 'kick',
    reason,
  });

  try {
    await member.kick(
      `Case #${caseRow.case_number} bởi ${interaction.user.tag}${reason ? `: ${reason}` : ''}`.slice(0, 512),
    );
  } catch (err) {
    hideCase(caseRow.id);
    await interaction.editReply({ embeds: [errorEmbed(`Không thể kick: ${err.message}`)] });
    return;
  }

  await logCase(interaction.guild, caseRow, { clientId: client.user.id });
  await interaction.editReply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
}
