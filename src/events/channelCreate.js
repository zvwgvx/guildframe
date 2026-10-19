import { Events } from 'discord.js';
import { getGuildConfig } from '../db.js';
import { applyMuteOverwrite } from '../services/mutes.js';

export const name = Events.ChannelCreate;

// Kênh mới tạo -> tự áp overwrite chặn cho role Muted (nếu đã cấu hình).
export async function execute(channel, client) {
  if (!channel.guild) return;
  try {
    const cfg = getGuildConfig(channel.guild.id);
    if (!cfg.mute_role_id) return;

    const role = await channel.guild.roles.fetch(cfg.mute_role_id).catch(() => null);
    if (!role) return;

    await applyMuteOverwrite(channel, role, 'Tự động áp dụng cho kênh mới');
  } catch (err) {
    console.error('[channelCreate] Không áp được overwrite mute:', err.message);
  }
}
