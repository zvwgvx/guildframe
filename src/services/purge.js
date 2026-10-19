// Chat-history purge: deletes every message a user sent across the server within a
// recent window (used when the do-not-type trap kicks someone).
import { PermissionsBitField } from 'discord.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 15; // safety cap: 1500 most recent messages scanned per channel

// Walks pages backwards and collects the user's messages until they fall outside the window.
async function collectRecentMessages(channel, userId, windowStart) {
  const collected = [];
  let cursor;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await channel.messages
      .fetch({ limit: PAGE_SIZE, ...(cursor ? { before: cursor } : {}) })
      .catch(() => null);
    if (!batch?.size) break;

    let outsideWindow = false;
    for (const message of batch.values()) {
      cursor = message.id;
      if (message.createdTimestamp < windowStart) {
        outsideWindow = true;
        break;
      }
      if (message.author?.id === userId) collected.push(message);
    }
    if (outsideWindow) break;
  }

  return collected;
}

function usableChannel(channel, me, { fetchThreads = false } = {}) {
  if (!channel.isTextBased()) return false;
  if (me && !channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageMessages])) {
    return false;
  }
  if (!fetchThreads && channel.isThread()) return false;
  return true;
}

// Returns { skipped, deleted, channels } - how many messages were deleted in how many channels.
export async function purgeRecentMessages(guild, userId, { windowMs = 30 * 60 * 1000 } = {}) {
  if (!windowMs || windowMs <= 0) return { skipped: true, deleted: 0, channels: 0 };

  const windowStart = Date.now() - windowMs;
  const me = guild.members.me;

  const main = guild.channels.cache.filter((c) => usableChannel(c, me) && !c.isThread());

  // Include active threads (text/forum parents) so nothing is missed.
  const threads = [];
  for (const channel of main.values()) {
    if (typeof channel.threads?.fetchActive !== 'function') continue;
    const active = await channel.threads.fetchActive().catch(() => null);
    if (!active) continue;
    for (const thread of active.threads.values()) {
      if (usableChannel(thread, me, { fetchThreads: true })) threads.push(thread);
    }
  }

  let deleted = 0;
  let channelsTouched = 0;
  for (const channel of [...main.values(), ...threads]) {
    const collected = await collectRecentMessages(channel, userId, windowStart);
    if (!collected.length) continue;

    let channelDeleted = 0;
    for (let i = 0; i < collected.length; i += PAGE_SIZE) {
      const removed = await channel
        .bulkDelete(collected.slice(i, i + PAGE_SIZE), true) // true = silently skip too-old messages
        .catch(() => null);
      if (removed) channelDeleted += removed.size;
    }
    if (channelDeleted) {
      deleted += channelDeleted;
      channelsTouched++;
      console.log(`[purge] Deleted ${channelDeleted} message(s) in #${channel.name}.`);
    }
  }

  return { skipped: false, deleted, channels: channelsTouched };
}
