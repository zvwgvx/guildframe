import { Events } from 'discord.js';
import { config } from '../config.js';
import { handleDoNotType } from '../prefix/doNotType.js';
import { handlePrefixCommand } from '../prefix/handler.js';

export const name = Events.MessageCreate;

export async function execute(message, client) {
  if (!message.guild || message.guild.id !== config.guildId) return;

  // Catch anything posted in the do-not-type channel (including bot accounts).
  if (
    config.doNotType?.channelId &&
    message.channelId === config.doNotType.channelId &&
    message.author.id !== client.user.id
  ) {
    await handleDoNotType(message, client);
    return;
  }

  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;
  await handlePrefixCommand(message, client);
}
