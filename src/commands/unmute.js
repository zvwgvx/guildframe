import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { removeMute } from '../services/mutes.js';
import { buildCaseEmbed, errorEmbed } from '../utils/embeds.js';
import { ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Gỡ mute (xóa role Muted) cho một thành viên')
  .addUserOption((o) => o.setName('user').setDescription('Thành viên cần unmute').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Lý do unmute'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageRoles, 'Quản lý Roles'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.ManageRoles, 'Quản lý Roles'))) return;

  const user = interaction.options.getUser('user');
  const member = interaction.options.getMember('user');

  try {
    const caseRow = await removeMute(interaction.guild, {
      userId: user.id,
      member,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString('reason'),
      clientId: client.user.id,
    });
    if (!caseRow) {
      await interaction.editReply({
        embeds: [errorEmbed(`${user} hiện không bị mute.`)],
      });
      return;
    }
    await interaction.editReply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
  } catch (err) {
    console.error('[unmute]', err);
    await interaction.editReply({ embeds: [errorEmbed(`Không thể unmute: ${err.message}`)] });
  }
}
