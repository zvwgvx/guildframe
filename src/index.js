import { Client, Collection, GatewayIntentBits } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertConfig, config } from './config.js';
import { loadCommands, loadEvents } from './utils/loaders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

assertConfig({ requireGuild: true });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // enable "Server Members Intent" in the Developer Portal
    GatewayIntentBits.GuildMessages, // prefix commands
    GatewayIntentBits.MessageContent, // enable "Message Content Intent" in the Developer Portal
    GatewayIntentBits.GuildModeration, // ban/unban events + audit log entries
    GatewayIntentBits.GuildPresences, // enable "Presence Intent" in the Developer Portal (live online counts)
    GatewayIntentBits.GuildVoiceStates, // create-voice: detect lobby joins (not privileged)
  ],
});

client.commands = new Collection();
await loadCommands(path.join(__dirname, 'commands'), client.commands);
await loadEvents(client, path.join(__dirname, 'events'));

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

await client.login(config.token).catch((err) => {
  console.error('[login] Failed to log in:', err.message);
  process.exit(1);
});
