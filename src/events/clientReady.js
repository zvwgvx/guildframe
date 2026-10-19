import { ActivityType, Events } from 'discord.js';
import { config } from '../config.js';
import { initScheduler } from '../services/scheduler.js';
import { refreshTrapMessage } from '../services/trap.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  console.log(`[bot] Logged in as ${client.user.tag} (${client.guilds.cache.size} guild(s)).`);
  if (!client.guilds.cache.has(config.guildId)) {
    console.warn(`[bot] WARNING: the bot is not in the configured guild (${config.guildId}).`);
  }
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'moderation', type: ActivityType.Watching }],
  });
  initScheduler(client);
  await refreshTrapMessage(client).catch((err) => console.error('[trap] Initial refresh failed:', err.message));
}
