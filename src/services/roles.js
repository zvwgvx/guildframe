// Member (verified) role management: marks regular users. Auto-assigned on join.
import { config, updateFileConfig } from '../config.js';

// Finds or creates the member role (config.memberRoleId takes priority; the created role id is persisted).
export async function ensureMemberRole(guild, { createIfMissing = true, reason = 'Member role setup' } = {}) {
  let role = config.memberRoleId ? await guild.roles.fetch(config.memberRoleId).catch(() => null) : null;

  if (!role) {
    role =
      guild.roles.cache.find(
        (r) => !r.managed && r.name.toLowerCase() === String(config.memberRoleName).toLowerCase(),
      ) ?? null;
  }
  if (!role && !createIfMissing) return null;
  if (!role) {
    role = await guild.roles.create({
      name: config.memberRoleName,
      color: 0x57f287,
      hoist: false,
      mentionable: false,
      permissions: [],
      reason,
    });
    console.log(`[roles] Created the "${role.name}" role (${role.id}).`);
  }
  if (config.memberRoleId !== role.id) {
    updateFileConfig({ memberRoleId: role.id });
    console.log(`[roles] Saved memberRoleId=${role.id} to config.json.`);
  }
  return role;
}
