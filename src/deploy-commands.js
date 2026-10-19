// Đăng ký slash command với Discord. Chạy: npm run deploy
import { REST, Routes } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertConfig, config } from './config.js';
import { loadCommands } from './utils/loaders.js';

assertConfig();
if (!config.clientId) {
  console.error('Thiếu CLIENT_ID trong .env — không thể đăng ký slash command.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commands = await loadCommands(path.join(__dirname, 'commands'), new Map());
const body = [...commands.values()].map((c) => c.data.toJSON());

const rest = new REST().setToken(config.token);
const route = config.devGuildId
  ? Routes.applicationGuildCommands(config.clientId, config.devGuildId)
  : Routes.applicationCommands(config.clientId);

try {
  const data = await rest.put(route, { body });
  console.log(
    `[deploy] Đã đăng ký ${data.length} lệnh ${
      config.devGuildId ? `cho guild ${config.devGuildId}` : 'toàn cục (có thể mất tới 1 giờ để hiển thị)'
    }.`,
  );
} catch (err) {
  console.error('[deploy] Lỗi đăng ký lệnh:', err);
  process.exit(1);
}
