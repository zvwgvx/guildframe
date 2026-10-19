import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { removeMute } from '../services/mutes.js';
import { buildActionEmbed, errorEmbed } from '../utils/embeds.js';
import { ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Remove the Muted role from a member')
  .addUserOption((o) => o.setName('user').setDescription('The member to unmute').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason for the unmute'));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageRoles, 'Manage Roles'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.ManageRoles, 'Manage Roles'))) return;

  const user = interaction.options.getUser('user');
  const member = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason');

  try {
    const caseRow = await removeMute(interaction.guild, {
      userId: user.id,
      member,
      moderatorId: interaction.user.id,
      reason,
      clientId: client.user.id,
    });
    if (!caseRow) {
      await interaction.editReply({ embeds: [errorEmbed(`<@${user.id}> is not muted.`)] });
      return;
    }
    await interaction.editReply({
      embeds: [
        buildActionEmbed({ action: 'unmute', target: user, reason, guildName: interaction.guild.name }),
      ],
    });
  } catch (err) {
    console.error('[unmute]', err);
    await interaction.editReply({ embeds: [errorEmbed(`Could not unmute: ${err.message}`)] });
  }
}
