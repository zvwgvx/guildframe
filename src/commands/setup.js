import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { ensureMuteRole, applyMuteOverwritesAll } from '../services/mutes.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { ensureBotPermissions, ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Set up the bot: create/use the Muted role and apply channel restrictions');

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageGuild, 'Manage Server'))) return;
  if (!(await ensureBotPermissions(interaction, PermissionsBitField.Flags.ManageRoles, 'Manage Roles'))) return;

  const guild = interaction.guild;
  const role = await ensureMuteRole(guild, { reason: `Setup by ${interaction.user.tag}` });
  const { ok, failed } = await applyMuteOverwritesAll(guild, role);

  const lines = [
    `Muted role: <@&${role.id}>`,
    `Applied restrictions to **${ok}** channel(s)${failed ? ` (⚠️ ${failed} failed)` : ''}.`,
    config.modLogChannelId
      ? `Mod log channel: <#${config.modLogChannelId}>`
      : 'Mod log channel: ⚠️ not set - add `modLogChannelId` to config.json',
    '',
    'New channels are automatically restricted. If the Muted role is deleted, the bot recreates it on the next mute.',
  ];
  if (failed) {
    lines.push('⚠️ Some channels failed: make sure the bot has **Manage Roles** and its role is above the Muted role.');
  }

  await interaction.editReply({ embeds: [successEmbed(lines.join('\n'), 'Setup complete')] });
}
