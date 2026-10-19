import { Events } from 'discord.js';
import { config } from '../config.js';
import { applyMuteOverwrite } from '../services/mutes.js';

export const name = Events.ChannelCreate;

// Applies the Muted role restrictions to newly created channels.
export async function execute(channel, client) {
  if (!channel.guild || channel.guild.id !== config.guildId) return;
  try {
    if (!config.muteRoleId) return;
    const role = await channel.guild.roles.fetch(config.muteRoleId).catch(() => null);
    if (!role) return;
    await applyMuteOverwrite(channel, role, 'Apply Muted role restrictions to new channel');
  } catch (err) {
    console.error('[channelCreate] Failed to apply the mute overwrite:', err.message);
  }
}
