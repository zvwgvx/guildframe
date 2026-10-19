// Role management (created by =install / /install, auto-assigned on member join):
// - Member: basic access - view plus normal chat (special categories are configured in Discord).
// - Bots: shared role for bot accounts.
// - Bot ("Moderation Bot" by default): dedicated role for this bot, meant to sit at the top.
import { PermissionsBitField } from 'discord.js';
import { config, updateFileConfig } from '../config.js';

// The subset of permissions the bot itself has via the invite, so role creation never gets rejected.
const MEMBER_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
];

// The hidden role that carries all of the bot's powers (subset of the invite permissions
// so role creation never gets rejected).
const BOT_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.ViewAuditLog,
];

const NO_PERMISSIONS = [];

const ROLE_DEFS = {
  member: { idKey: 'memberRoleId', nameKey: 'memberRoleName', permissions: MEMBER_PERMISSIONS, color: 0x57f287 },
  bots: { idKey: 'botsRoleId', nameKey: 'botsRoleName', permissions: NO_PERMISSIONS, color: 0x3498db },
  // Visible bot identity role - carries no permissions by itself (placed below Member).
  bot: { idKey: 'botRoleId', nameKey: 'botRoleName', permissions: NO_PERMISSIONS, color: 0x5865f2 },
  // Hidden role that actually carries the bot's powers (not hoisted, no colour).
  botPerms: {
    idKey: 'botPermsRoleId',
    nameKey: 'botPermsRoleName',
    permissions: BOT_PERMISSIONS,
    color: null,
    hoist: false,
  },
};

// Generic find-or-create. New roles spawn at the bottom; creation order in the installer
// (this bot > Bots > Muted > Member) gives them a sane relative hierarchy.
async function ensureRole(guild, kind, { createIfMissing = true, reason = 'Role setup' } = {}) {
  const { idKey, nameKey, permissions, color, hoist = false } = ROLE_DEFS[kind];
  const id = config[idKey];
  const name = config[nameKey];

  let role = id ? await guild.roles.fetch(id).catch(() => null) : null;
  if (!role) {
    role =
      guild.roles.cache.find(
        (r) => !r.managed && r.name.toLowerCase() === String(name).toLowerCase(),
      ) ?? null;
  }
  if (!role && !createIfMissing) return null;
  if (!role) {
    role = await guild.roles.create({
      name,
      color,
      hoist: Boolean(hoist),
      mentionable: false,
      permissions,
      reason,
    });
    console.log(`[roles] Created the "${role.name}" role (${role.id}).`);
  }
  if (config[idKey] !== role.id) {
    updateFileConfig({ [idKey]: role.id });
    console.log(`[roles] Saved ${idKey}=${role.id} to config.json.`);
  }
  return role;
}

export const ensureMemberRole = (guild, opts) => ensureRole(guild, 'member', opts);
export const ensureBotsRole = (guild, opts) => ensureRole(guild, 'bots', opts);
export const ensureBotRole = (guild, opts) => ensureRole(guild, 'bot', opts);
export const ensureBotPermsRole = (guild, opts) => ensureRole(guild, 'botPerms', opts);
