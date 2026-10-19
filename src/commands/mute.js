import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { MAX_MUTE_MS } from '../constants.js';
import { getActiveCases } from '../db.js';
import { applyMute } from '../services/mutes.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { buildActionEmbed, errorEmbed } from '../utils/embeds.js';
import { canModerateMember, ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Mute a member using the Muted role')
  .addUserOption((o) => o.setName('user').setDescription('The member to mute').setRequired(true))
  .addStringOption((o) =>
    o.setName('duration').setDescription('Duration: 5m, 3d, perm (omit = permanent)'),
  )
  .addStringOption((o) => o.setName('reason').setDescription('Reason for the mute'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageRoles, 'Manage Roles'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.ManageRoles, 'Manage Roles'))) return;

  const member = interaction.options.getMember('user');
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed('That user is not in this server.')] });
    return;
  }
  if (!(await canModerateMember(interaction, member))) return;

  const active = getActiveCases(interaction.guildId, member.id, 'mute');
  if (active.length) {
    await interaction.editReply({
      embeds: [errorEmbed(`<@${member.id}> is already muted (Case #${active[0].case_number}). Use /unmute first.`)],
    });
    return;
  }

  let durationMs;
  try {
    durationMs = parseDuration(interaction.options.getString('duration'));
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    return;
  }
  if (durationMs && durationMs > MAX_MUTE_MS) {
    await interaction.editReply({ embeds: [errorEmbed(`Maximum mute duration is ${formatDuration(MAX_MUTE_MS)}.`)] });
    return;
  }

  const reason = interaction.options.getString('reason');
  try {
    const { caseRow } = await applyMute(interaction.guild, member, {
      moderatorId: interaction.user.id,
      reason,
      durationMs,
      clientId: client.user.id,
    });
    await interaction.editReply({
      embeds: [
        buildActionEmbed({
          action: 'mute',
          target: member.user,
          durationMs,
          reason,
          guildName: interaction.guild.name,
        }),
      ],
    });
  } catch (err) {
    console.error('[mute]', err);
    await interaction.editReply({ embeds: [errorEmbed(`Could not mute: ${err.message}`)] });
  }
}
