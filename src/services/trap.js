// Do-not-type trap: keeps a persistent "Warning" message with live counter buttons
// in the configured channel (caught/muted/kicked/banned counters, no emoji).
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { bumpTrapStat, getInstallMessage, getTrapStats, setInstallMessage } from '../db.js';
import { baseEmbed } from '../utils/embeds.js';

export const TRAP_MESSAGE_KEY = 'trap';

const ACTION_VERBS = { mute: 'muted', kick: 'kicked', ban: 'banned' };

// Counter buttons (order matters). "caught" is always shown; action counters appear once used.
const STAT_BUTTONS = [
  ['caught', 'Caught'],
  ['muted', 'Muted'],
  ['kicked', 'Kicked'],
  ['banned', 'Banned'],
];

function buildTrapPayload(guild, stats) {
  const action = String(config.doNotType?.action ?? 'alert').toLowerCase();
  const verb = ACTION_VERBS[action];

  const lines = ['**DO NOT POST MESSAGES IN THIS CHANNEL,**'];
  if (verb) lines.push(`**you will be ${verb} from ${guild.name} if you do so!**`);
  else lines.push('**you will be dealt with by our staff if you do so!**');
  lines.push('', 'This channel is used to catch bots that spam our server.');

  const embed = baseEmbed(COLORS.warn)
    .setTitle('Warning')
    .setDescription(lines.join('\n'))
    .setFooter({ text: guild.name });

  const metrics = STAT_BUTTONS.filter(([key]) => key === 'caught' || (stats[key] ?? 0) > 0);
  const row = new ActionRowBuilder().addComponents(
    metrics.map(([key, label]) =>
      new ButtonBuilder()
        .setCustomId(`trap_stat_${key}`)
        .setLabel(`${label}: ${stats[key] ?? 0}`)
        .setStyle(ButtonStyle.Primary),
    ),
  );

  return { embeds: [embed], components: metrics.length ? [row] : [] };
}

// Edits the stored warning message, or posts a new one when missing. Safe to call often.
export async function refreshTrapMessage(client) {
  const channelId = config.doNotType?.channelId;
  if (!channelId) return null;

  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return null;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[trap] do-not-type channel ${channelId} not found or not text-based.`);
    return null;
  }

  const payload = buildTrapPayload(guild, getTrapStats(guild.id));
  const stored = getInstallMessage(guild.id, TRAP_MESSAGE_KEY);

  if (stored?.message_id) {
    const message = await channel.messages.fetch(stored.message_id).catch(() => null);
    if (message && message.author.id === client.user.id) {
      await message.edit(payload).catch(() => {});
      return message;
    }
  }

  const sent = await channel.send(payload);
  setInstallMessage(guild.id, TRAP_MESSAGE_KEY, channel.id, sent.id);
  return sent;
}

// Called every time someone triggers the trap: updates counters then refreshes the message.
export async function onTrapCaught(message, actionTaken, client) {
  const guildId = message.guild.id;
  bumpTrapStat(guildId, 'caught');
  if (actionTaken && actionTaken !== 'alert') bumpTrapStat(guildId, actionTaken);
  await refreshTrapMessage(client).catch((err) => console.error('[trap] Refresh failed:', err.message));
}
