// Registers the global slash commands with Discord. Run: npm run deploy
import { REST, Routes } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertConfig, config } from './config.js';
import { loadCommands } from './utils/loaders.js';

assertConfig();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commands = await loadCommands(path.join(__dirname, 'commands'), new Map());
const body = [...commands.values()].map((c) => c.data.toJSON());

const rest = new REST().setToken(config.token);

try {
  const data = await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log(`[deploy] Registered ${data.length} global slash command(s). They may take up to an hour to appear.`);
} catch (err) {
  console.error('[deploy] Failed to register commands:', err);
  process.exit(1);
}
