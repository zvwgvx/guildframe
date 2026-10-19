// Cấu hình runtime, đọc từ biến môi trường (nạp qua --env-file=.env trong npm scripts).
const token = process.env.DISCORD_TOKEN?.trim() || '';
const clientId = process.env.CLIENT_ID?.trim() || '';
const devGuildId = process.env.GUILD_ID?.trim() || '';

export const config = {
  token,
  clientId,
  devGuildId: devGuildId || null,
  muteRoleName: (process.env.MUTE_ROLE_NAME || 'Muted').trim(),
  defaultModLogChannelId: process.env.MOD_LOG_CHANNEL_ID?.trim() || null,
  dbPath: process.env.DB_PATH?.trim() || './data/bot.sqlite',
};

export function assertConfig() {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (missing.length) {
    throw new Error(
      `Thiếu biến môi trường: ${missing.join(', ')}. Hãy copy .env.example thành .env và điền giá trị.`,
    );
  }
}
