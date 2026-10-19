// Welcome card posted in the configured channel when a human member joins.
// Style: our own embed (no emoji) - mention line, rules reminder, details
// block (user ID, auto-assigned role, join date) and the live member count.
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import { baseEmbed, rel, ts } from '../utils/embeds.js';

export function buildWelcomeCard(member) {
  const memberCount = member.guild.memberCount;
  return baseEmbed(COLORS.success)
    .setTitle(`Welcome, ${member.user.username}`)
    .setDescription(
      [
        'Please read the rules and enjoy your stay.',
        '',
        '**[ • ] Details**',
        '```',
        `User ID  · ${member.id}`,
        `Role     · ${config.memberRoleName || 'Member'} (auto-assigned)`,
        `Joined   · ${ts(Date.now())} (${rel(Date.now())})`,
        '```',
      ].join('\n'),
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `We now have ${memberCount} member${memberCount === 1 ? '' : 's'}!`, iconURL: member.guild.iconURL({ size: 64 }) ?? undefined });
}

// Sends the welcome card; silently skipped when disabled or the channel is gone.
export async function sendWelcome(member) {
  const channelId = config.welcome?.channelId;
  if (!channelId || member.user.bot) return;

  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const card = buildWelcomeCard(member);
  await channel
    .send({
      content: `<@${member.id}>, Welcome to ${member.guild.name}!`,
      embeds: [card],
      allowedMentions: { users: [member.id], roles: [] },
    })
    .catch((err) => console.error('[welcome] Failed to post the welcome card:', err.message));
}
