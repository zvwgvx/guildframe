import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { countActiveByType, createCase, getActiveCases, getGuildConfig } from '../db.js';
import { applyMute } from '../services/mutes.js';
import { logCase } from '../services/log.js';
import { buildCaseEmbed, errorEmbed } from '../utils/embeds.js';
import { formatDuration } from '../utils/duration.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Cảnh cáo một người dùng, đồng thời tăng offence count')
  .addUserOption((o) => o.setName('user').setDescription('Người dùng cần cảnh cáo').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Lý do cảnh cáo'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Quản lý tin nhắn'))) {
    return;
  }

  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const guild = interaction.guild;

  const caseRow = createCase({
    guildId: guild.id,
    userId: user.id,
    moderatorId: interaction.user.id,
    type: 'warn',
    reason,
  });
  await logCase(guild, caseRow, { clientId: client.user.id });

  const activeWarns = countActiveByType(guild.id, user.id, 'warn');
  const cfg = getGuildConfig(guild.id);
  let escalateNote = null;

  // Auto-escalation: đạt ngưỡng cảnh cáo -> tự động mute tạm thời (nếu được bật trong /config).
  if (cfg.warn_threshold > 0 && activeWarns >= cfg.warn_threshold) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    const activeMutes = getActiveCases(guild.id, user.id, 'mute');
    if (member && !activeMutes.length) {
      try {
        const { caseRow: muteCase } = await applyMute(guild, member, {
          moderatorId: client.user.id,
          reason: `Tự động: đạt ${cfg.warn_threshold} cảnh cáo đang hiệu lực`,
          durationMs: cfg.warn_mute_ms,
          clientId: client.user.id,
        });
        escalateNote = `Đạt ngưỡng ${cfg.warn_threshold} cảnh cáo → đã tự động mute ${formatDuration(cfg.warn_mute_ms)} (Case #${muteCase.case_number}).`;
      } catch (err) {
        console.error('[warn] Auto-mute thất bại:', err);
        escalateNote = 'Đạt ngưỡng cảnh cáo nhưng KHÔNG auto-mute được (kiểm tra quyền/role của bot).';
      }
    }
  }

  const embed = buildCaseEmbed(caseRow, { clientId: client.user.id });
  embed.addFields({ name: 'Cảnh cáo đang hiệu lực', value: String(activeWarns), inline: true });
  if (escalateNote) embed.addFields({ name: '⚙️ Tự động', value: escalateNote });

  await interaction.editReply({ embeds: [embed] });
}
