import { ActivityType, Events } from 'discord.js';
import { config } from '../config.js';
import { refreshMutedCmdsNotice } from '../services/install.js';
import { initScheduler } from '../services/scheduler.js';
import { refreshStatusMessage, startStatusLoop } from '../services/status.js';
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
  await refreshMutedCmdsNotice(client).catch((err) =>
    console.error('[install] Initial muted-commands notice refresh failed:', err.message),
  );
  await refreshStatusMessage(client).catch((err) => console.error('[status] Initial refresh failed:', err.message));
  startStatusLoop(client);
}
