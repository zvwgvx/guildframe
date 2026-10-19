import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { createCase, getActiveCases, setActiveCasesStatus } from '../db.js';
import { logCase } from '../services/log.js';
import { cancelCaseTimer } from '../services/scheduler.js';
import { buildActionEmbed, errorEmbed } from '../utils/embeds.js';
import { ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Remove a ban by user ID')
  .addStringOption((o) => o.setName('user_id').setDescription('The banned user ID').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason for the unban'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.BanMembers, 'Ban Members'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.BanMembers, 'Ban Members'))) return;

  const userId = interaction.options.getString('user_id').trim();
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.editReply({ embeds: [errorEmbed('Invalid user ID (must be a numeric ID).')] });
    return;
  }

  const existing = await interaction.guild.bans.fetch(userId).catch(() => null);
  if (!existing) {
    await interaction.editReply({ embeds: [errorEmbed(`<@${userId}> is not banned.`)] });
    return;
  }

  const reason = interaction.options.getString('reason');
  for (const c of getActiveCases(interaction.guildId, userId, 'ban')) cancelCaseTimer(c.id);
  setActiveCasesStatus(interaction.guildId, userId, 'ban', 'removed');

  try {
    await interaction.guild.bans.remove(
      userId,
      `Unban by ${interaction.user.tag}${reason ? `: ${reason}` : ''}`.slice(0, 512),
    );
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(`Could not unban: ${err.message}`)] });
    return;
  }

  const caseRow = createCase({
    guildId: interaction.guildId,
    userId,
    moderatorId: interaction.user.id,
    type: 'unban',
    reason,
  });
  await logCase(interaction.guild, caseRow, { clientId: client.user.id });
  await interaction.editReply({
    embeds: [buildActionEmbed({ action: 'unban', target: existing.user, reason, guildName: interaction.guild.name })],
  });
}
