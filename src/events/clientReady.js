import { ActivityType, Events } from 'discord.js';
import { initScheduler } from '../services/scheduler.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client) {
  console.log(`[bot] Đã đăng nhập: ${client.user.tag} — ${client.guilds.cache.size} server`);
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'moderation • /setup để bắt đầu', type: ActivityType.Watching }],
  });
  initScheduler(client);
}
