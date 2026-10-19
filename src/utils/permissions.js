import { MessageFlags, PermissionsBitField } from 'discord.js';
import { config } from '../config.js';
import { errorEmbed } from './embeds.js';

// ---------- Interaction helpers ----------

export async function replyEphemeral(interaction, embed) {
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ embeds: [embed] });
  } else if (interaction.replied) {
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

export function isConfiguredGuild(guildId) {
  return guildId === config.guildId;
}

export function isAdministrator(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

export function isModRole(member) {
  return Boolean(config.modRoleId && member.roles.cache.has(config.modRoleId));
}

export function isModerator(member) {
  return isAdministrator(member) || isModRole(member);
}

// Commands can opt out of the moderator-role bypass (modRoleAllowed: false)
// to require the actual Discord permission.
export function hasModPermission(member, permissionFlag, { modRoleAllowed = true } = {}) {
  if (member.permissions.has(permissionFlag)) return true;
  if (isAdministrator(member)) return true;
  return modRoleAllowed && isModRole(member);
}

function deniedMessage(permissionLabel, modRoleAllowed) {
  const base = `You need the **${permissionLabel}** permission`;
  return modRoleAllowed
    ? `${base} (or the configured moderator role) to use this command.`
    : `${base} to use this command - the moderator role is not sufficient.`;
}

// Returns false (and replies with an error) when the caller is not allowed.
export async function ensureModerator(interaction, permissionFlag, permissionLabel, { modRoleAllowed = true } = {}) {
  if (isConfiguredGuild(interaction.guildId) && hasModPermission(interaction.member, permissionFlag, { modRoleAllowed })) {
    return true;
  }
  await replyEphemeral(interaction, errorEmbed(deniedMessage(permissionLabel, modRoleAllowed)));
  return false;
}

export async function ensureBotPermissions(interaction, permissionFlag, permissionLabel) {
  const me = interaction.guild.members.me;
  if (me.permissions.has(permissionFlag)) return true;
  await replyEphemeral(interaction, errorEmbed(`The bot is missing the **${permissionLabel}** permission.`));
  return false;
}

export async function canModerateMember(interaction, targetMember) {
  const me = interaction.guild.members.me;
  const deny = async (text) => {
    await replyEphemeral(interaction, errorEmbed(text));
    return false;
  };

  if (targetMember.id === interaction.user.id) return deny('You cannot moderate yourself.');
  if (targetMember.id === me.id) return deny('The bot cannot moderate itself.');
  if (targetMember.id === interaction.guild.ownerId) return deny('You cannot moderate the server owner.');
  if (targetMember.roles.highest.position >= me.roles.highest.position) {
    return deny("That member's highest role is equal to or above the bot's highest role.");
  }
  return true;
}

// ---------- Message (prefix command) helpers ----------

export function ensureModeratorMessage(message, permissionFlag, permissionLabel, { modRoleAllowed = true } = {}) {
  if (hasModPermission(message.member, permissionFlag, { modRoleAllowed })) return true;
  message.reply({ embeds: [errorEmbed(deniedMessage(permissionLabel, modRoleAllowed))] });
  return false;
}

export function canModerateMemberMessage(message, targetMember) {
  const me = message.guild.members.me;
  const deny = (text) => {
    message.reply({ embeds: [errorEmbed(text)] });
    return false;
  };

  if (targetMember.id === message.author.id) return deny('You cannot moderate yourself.');
  if (targetMember.id === me.id) return deny('The bot cannot moderate itself.');
  if (targetMember.id === message.guild.ownerId) return deny('You cannot moderate the server owner.');
  if (targetMember.roles.highest.position >= me.roles.highest.position) {
    return deny("That member's highest role is equal to or above the bot's highest role.");
  }
  return true;
}
