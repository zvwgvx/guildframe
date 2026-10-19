// Configuration loader.
// Secrets come from .env (DISCORD_TOKEN, CLIENT_ID); everything else lives in config.json.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.resolve(process.env.CONFIG_PATH || './config.json');

const DEFAULT_FILE_CONFIG = {
  prefix: '=',
  guildId: '',
  muteRoleId: '',
  muteRoleName: 'Muted',
  modRoleId: '',
  modLogChannelId: '',
  memberRoleId: '',
  memberRoleName: 'Member',
  mutedBotCmdsChannelId: '',
  botStatusChannelId: '',
  doNotType: { channelId: '', action: 'alert' },
  warnEscalation: { threshold: 0, duration: '1h' },
};

function loadFileConfig() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_FILE_CONFIG, ...raw, doNotType: { ...DEFAULT_FILE_CONFIG.doNotType, ...raw.doNotType }, warnEscalation: { ...DEFAULT_FILE_CONFIG.warnEscalation, ...raw.warnEscalation } };
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('[config] config.json not found, falling back to defaults. Copy config.example.json to config.json.');
      return { ...DEFAULT_FILE_CONFIG };
    }
    throw new Error(`[config] Failed to parse ${CONFIG_PATH}: ${err.message}`);
  }
}

export const fileConfig = loadFileConfig();

export const config = {
  token: process.env.DISCORD_TOKEN?.trim() || '',
  clientId: process.env.CLIENT_ID?.trim() || '',
  dbPath: process.env.DB_PATH?.trim() || './data/bot.sqlite',
  configPath: CONFIG_PATH,
  ...fileConfig,
};

// Persist a patch (top-level or nested one level) back to config.json.
export function updateFileConfig(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      config[key] = { ...(config[key] ?? {}), ...value };
    } else {
      config[key] = value;
    }
  }
  const { token, clientId, dbPath, configPath, ...fileOnly } = config;
  writeFileSync(CONFIG_PATH, `${JSON.stringify(fileOnly, null, 2)}\n`);
}

export function assertConfig({ requireGuild = false } = {}) {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN (in .env)');
  if (!config.clientId) missing.push('CLIENT_ID (in .env)');
  if (requireGuild && !/^\d{17,20}$/.test(String(config.guildId))) {
    missing.push('guildId (in config.json)');
  }
  if (missing.length) {
    throw new Error(`Missing configuration: ${missing.join(', ')}.`);
  }
}
