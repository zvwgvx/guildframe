import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { MAX_MUTE_MS } from '../constants.js';
import { getActiveCases } from '../db.js';
import { applyMute } from '../services/mutes.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { buildCaseEmbed, errorEmbed, ts } from '../utils/embeds.js';
import { canModerateMember, ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Mute một thành viên bằng role Muted (kèm thời hạn tuỳ chọn)')
  .addUserOption((o) => o.setName('user').setDescription('Thành viên cần mute').setRequired(true))
  .addStringOption((o) =>
    o.setName('duration').setDescription('Thời hạn: 30m, 2h, 7d... Bỏ trống = vĩnh viễn'),
  )
  .addStringOption((o) => o.setName('reason').setDescription('Lý do mute'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageRoles, 'Quản lý Roles'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.ManageRoles, 'Quản lý Roles'))) return;

  const member = interaction.options.getMember('user');
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed('Người dùng này không ở trong server.')] });
    return;
  }
  if (!(await canModerateMember(interaction, member))) return;

  const active = getActiveCases(interaction.guildId, member.id, 'mute');
  if (active.length) {
    await interaction.editReply({
      embeds: [errorEmbed(`${member} đang bị mute (Case #${active[0].case_number}). Dùng /unmute trước.`)],
    });
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
  if (durationMs && durationMs > MAX_MUTE_MS) {
    await interaction.editReply({
      embeds: [errorEmbed(`Thời hạn mute tối đa là ${formatDuration(MAX_MUTE_MS)}.`)],
    });
    return;
  }

  try {
    const { caseRow } = await applyMute(interaction.guild, member, {
      moderatorId: interaction.user.id,
      reason: interaction.options.getString('reason'),
      durationMs,
      clientId: client.user.id,
    });
    const embed = buildCaseEmbed(caseRow, { clientId: client.user.id });
    if (caseRow.expires_at) {
      embed.addFields({ name: '⏳ Tự động bỏ mute', value: ts(caseRow.expires_at, 'R'), inline: true });
    }
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[mute]', err);
    await interaction.editReply({ embeds: [errorEmbed(`Không thể mute: ${err.message}`)] });
  }
}
