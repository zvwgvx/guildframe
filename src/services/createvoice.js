// Create-voice: a lobby voice channel that spawns a personal voice channel on join.
// The personal channel's text chat carries a settings panel:
// privacy toggle, user limit and inviting members. Empty channels are deleted.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import {
  createVoiceRow,
  deleteVoiceRow,
  getVoiceRowByChannel,
  getVoiceRowByOwner,
  setVoiceOwner,
  setVoicePanelMessage,
} from '../db.js';
import { baseEmbed } from '../utils/embeds.js';
import { isTicketStaff } from './tickets.js';

export const CV_PRIVACY_ID = 'cv_privacy';
export const CV_LIMIT_ID = 'cv_limit';
export const CV_INVITE_ID = 'cv_invite';

// Invited members may see, join and use the voice chat. Speak is intentionally
// not force-allowed so a server-wide mute stays effective.
const VOICE_MEMBER_ALLOW = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.Connect,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
];

const LIMIT_OPTIONS = [0, 2, 3, 4, 5, 6, 8, 10];

const limitLabel = (limit) => (limit ? `${limit} users` : 'Unlimited');

const sanitizeVoiceName = (username) =>
  `${String(username).replace(/[`\\]/g, '').trim().slice(0, 88) || 'member'}'s VC`;

// The owner (creator) of the channel or staff may use the settings panel.
export function canControlVoice(row, member) {
  if (!member) return false;
  return member.id === row.owner_id || isTicketStaff(member);
}

// ---------- Panel ----------

function isPrivateVoice(channel) {
  const everyoneId = channel.guild.roles.everyone.id;
  const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
  return Boolean(overwrite?.deny.has(PermissionsBitField.Flags.Connect));
}

function buildVoicePanelEmbed(channel, row) {
  return baseEmbed(COLORS.info)
    .setTitle('Voice Channel')
    .setDescription(
      [
        '**[ • ] Settings**',
        '',
        `Owner: <@${row.owner_id}>`,
        `Privacy: ${isPrivateVoice(channel) ? 'Private' : 'Public'}`,
        `User Limit: ${limitLabel(channel.userLimit ?? 0)}`,
      ].join('\n'),
    );
}

function buildVoicePanelRows(channel) {
  const privacy = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CV_PRIVACY_ID)
      .setLabel(isPrivateVoice(channel) ? 'Set Public' : 'Set Private')
      .setStyle(isPrivateVoice(channel) ? ButtonStyle.Success : ButtonStyle.Primary),
  );

  const limit = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CV_LIMIT_ID)
      .setPlaceholder('User Limit')
      .addOptions(
        LIMIT_OPTIONS.map((n) => ({
          label: limitLabel(n),
          value: String(n),
          default: (channel.userLimit ?? 0) === n,
        })),
      ),
  );

  const invite = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId(CV_INVITE_ID).setPlaceholder('Invite a member').setMaxValues(5),
  );

  return [privacy, limit, invite];
}

export const buildVoicePanelPayload = (channel, row) => ({
  embeds: [buildVoicePanelEmbed(channel, row)],
  components: buildVoicePanelRows(channel),
});

// Re-renders the stored panel message after a settings change.
export async function refreshVoicePanel(channel, row) {
  const messageId = row?.panel_message_id;
  if (!messageId) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || message.author.id !== channel.client.user.id) return;
  await message.edit(buildVoicePanelPayload(channel, row)).catch(() => {});
}

// ---------- Join / leave ----------

// Joined the lobby: reuse the member's own channel, otherwise spawn a new one,
// move them in and post the settings panel into the channel's text chat.
export async function handleVoiceJoin(oldState, newState) {
  const lobbyId = config.createVoice.lobbyChannelId;
  if (!lobbyId || newState.channelId !== lobbyId || newState.channelId === oldState.channelId) return;
  const member = newState.member;
  if (!member || member.user?.bot) return;

  const guild = newState.guild;

  // Already owning a spawned channel: reconnect them to it.
  const owned = getVoiceRowByOwner(guild.id, member.id);
  if (owned) {
    const existing = await guild.channels.fetch(owned.channel_id).catch(() => null);
    if (existing && existing.isVoiceBased()) {
      await member.voice.setChannel(existing, 'Rejoined own voice channel').catch(() => {});
      return;
    }
    deleteVoiceRow(guild.id, owned.channel_id);
  }

  if (!guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;

  let channel;
  try {
    channel = await guild.channels.create({
      name: sanitizeVoiceName(member.user.username),
      type: ChannelType.GuildVoice,
      parent: newState.channel?.parentId ?? undefined,
      reason: `Create-voice joined by ${member.id}`,
    });
  } catch (err) {
    console.error('[voice] Channel creation failed:', err.message);
    return;
  }

  const row = createVoiceRow({ guildId: guild.id, channelId: channel.id, ownerId: member.id });

  const moved = await member.voice.setChannel(channel, 'Moved to personal voice channel').catch(() => null);
  if (!moved) {
    // The member vanished mid-creation - do not leave an orphan channel behind.
    await channel.delete('Owner never connected').catch(() => {});
    deleteVoiceRow(guild.id, channel.id);
    return;
  }

  const message = await channel.send(buildVoicePanelPayload(channel, row)).catch(() => null);
  if (message) setVoicePanelMessage(row.id, message.id);
}

// Left a spawned channel: delete it when empty, otherwise hand ownership
// to the first remaining member and refresh the panel.
export async function handleVoiceLeave(oldState) {
  const channel = oldState.channel;
  if (!channel || channel.id === config.createVoice.lobbyChannelId) return;

  const row = getVoiceRowByChannel(oldState.guild.id, channel.id);
  if (!row) return;

  if (channel.members.size === 0) {
    await channel.delete('Voice channel emptied').catch(() => {});
    deleteVoiceRow(oldState.guild.id, channel.id);
    return;
  }

  if (oldState.id === row.owner_id) {
    const nextOwner = channel.members.first();
    if (nextOwner) {
      setVoiceOwner(oldState.guild.id, channel.id, nextOwner.id);
      row.owner_id = nextOwner.id;
      await channel
        .send({ embeds: [baseEmbed(COLORS.info).setDescription(`<@${nextOwner.id}> is the new channel owner.`)] })
        .catch(() => {});
      await refreshVoicePanel(channel, row);
    }
  }
}

// ---------- Panel actions ----------

// Toggles between public (inherits category visibility) and private
// (@everyone denied, owner and invited members keep access).
export async function toggleVoicePrivacy(interaction) {
  const row = getVoiceRowByChannel(interaction.guildId, interaction.channelId);
  if (!row) return { error: 'This is not a spawned voice channel.' };
  if (!canControlVoice(row, interaction.member)) {
    return { error: 'Only the channel owner or staff can change the privacy.' };
  }

  const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return { error: 'This is not a spawned voice channel.' };

  const everyoneId = interaction.guild.roles.everyone.id;
  const wasPrivate = isPrivateVoice(channel);
  try {
    if (wasPrivate) {
      await channel.permissionOverwrites.delete(everyoneId, `Privacy set to public by ${interaction.member.id}`);
    } else {
      await channel.permissionOverwrites.edit(
        everyoneId,
        { deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
        { reason: `Privacy set to private by ${interaction.member.id}` },
      );
    }
  } catch (err) {
    return { error: `Could not update the channel permissions: ${err.message}` };
  }

  await refreshVoicePanel(channel, row);
  return { success: `Privacy set to ${wasPrivate ? 'Public' : 'Private'}.` };
}

// Applies the user limit chosen in the select menu.
export async function setVoiceLimit(interaction) {
  const row = getVoiceRowByChannel(interaction.guildId, interaction.channelId);
  if (!row) return { error: 'This is not a spawned voice channel.' };
  if (!canControlVoice(row, interaction.member)) {
    return { error: 'Only the channel owner or staff can change the user limit.' };
  }

  const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return { error: 'This is not a spawned voice channel.' };

  const value = Number(interaction.values[0]);
  const limit = Number.isFinite(value) && value > 0 ? value : 0;
  try {
    await channel.edit({ userLimit: limit }, `User limit set by ${interaction.member.id}`);
  } catch (err) {
    return { error: `Could not set the user limit: ${err.message}` };
  }

  await refreshVoicePanel(channel, row);
  return { success: `User limit set to ${limitLabel(limit)}.` };
}

// Grants the selected members access to the channel (also in private mode).
export async function inviteVoiceMembers(interaction) {
  const row = getVoiceRowByChannel(interaction.guildId, interaction.channelId);
  if (!row) return { error: 'This is not a spawned voice channel.' };
  if (!canControlVoice(row, interaction.member)) {
    return { error: 'Only the channel owner or staff can invite members.' };
  }

  const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return { error: 'This is not a spawned voice channel.' };

  const invited = [];
  for (const userId of interaction.values) {
    if (userId === row.owner_id) continue;
    try {
      await channel.permissionOverwrites.edit(
        userId,
        { allow: VOICE_MEMBER_ALLOW },
        { reason: `Invited to voice channel by ${interaction.member.id}` },
      );
      invited.push(userId);
    } catch (err) {
      console.error('[voice] Invite failed:', err.message);
    }
  }

  if (invited.length > 0) {
    await channel
      .send({
        embeds: [
          baseEmbed(COLORS.info).setDescription(
            `${invited.map((id) => `<@${id}>`).join(', ')} invited by <@${interaction.member.id}>.`,
          ),
        ],
      })
      .catch(() => {});
    await refreshVoicePanel(channel, row);
  }

  return { success: invited.length > 0 ? `Invited ${invited.length} member(s).` : 'No one new was invited.' };
}
