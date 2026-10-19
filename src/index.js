import { Client, Collection, GatewayIntentBits } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertConfig, config } from './config.js';
import { loadCommands, loadEvents } from './utils/loaders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

assertConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // cần bật "Server Members Intent" trong Developer Portal
    GatewayIntentBits.GuildModeration, // sự kiện ban/unban + audit log entry
  ],
});

client.commands = new Collection();
await loadCommands(path.join(__dirname, 'commands'), client.commands);
await loadEvents(client, path.join(__dirname, 'events'));

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

await client.login(config.token).catch((err) => {
  console.error('[login] Đăng nhập thất bại:', err.message);
  process.exit(1);
});
