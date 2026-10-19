// Ticket system: a single-button panel creates a private channel in the same category,
// visible only to the ticket owner, the configured staff role and the bot.
// In-ticket commands (slash and prefix): rename, close, add, remove.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionsBitField,
  Role,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { COLORS } from '../constants.js';
import {
  closeTicketRow,
  createTicketRow,
  getInstallMessage,
  getOpenTicketByOwner,
  getTicketByChannel,
  setInstallMessage,
} from '../db.js';
import { baseEmbed, buildAuditEmbed, truncate } from '../utils/embeds.js';
import { sendModLog } from './log.js';

export const TICKET_PANEL_MESSAGE_KEY = 'ticket_panel';
export const TICKET_BUTTON_ID = 'ticket_open';

// What a ticket participant (owner, staff, added members/roles) may do in the channel.
const TICKET_MEMBER_ALLOW = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.EmbedLinks,
];

const BOT_ALLOW = [
  ...TICKET_MEMBER_ALLOW,
  PermissionsBitField.Flags.ManageChannels,
];

const section = (title, lines) => `**${title}**\n\`\`\`\n${lines.join('\n')}\n\`\`\``;

// ---------- Panel ----------

function buildTicketPanelContainer() {
  const staffRoleId = config.tickets.staffRoleId;
  const lines = [
    'Press the button below to open a private ticket.',
    staffRoleId
      ? `Only you and <@&${staffRoleId}> can see the channel, nobody else.`
      : 'Only you and the staff team can see the channel.',
    'Inside the ticket you can use: /rename • /close • /add • /remove',
  ];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_BUTTON_ID).setLabel('Open Ticket').setStyle(ButtonStyle.Primary),
  );

  return new ContainerBuilder()
    .setAccentColor(COLORS.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Tickets'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(section('[ • ] Support', lines)))
    .addActionRowComponents(row);
}

export const buildTicketPanelPayload = () => ({
  components: [buildTicketPanelContainer()],
  flags: MessageFlags.IsComponentsV2,
});

// Edits the stored panel message, or posts a new one when missing.
export async function refreshTicketPanelMessage(client) {
  const channelId = config.tickets.panelChannelId;
  if (!channelId) return null;

  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return null;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[tickets] ticket panel channel ${channelId} not found or not text-based.`);
    return null;
  }

  const payload = buildTicketPanelPayload();
  const stored = getInstallMessage(guild.id, TICKET_PANEL_MESSAGE_KEY);

  if (stored?.message_id) {
    const message = await channel.messages.fetch(stored.message_id).catch(() => null);
    if (message && message.author.id === client.user.id) {
      await message.edit(payload).catch(() => {});
      return message;
    }
  }

  const sent = await channel.send(payload);
  setInstallMessage(guild.id, TICKET_PANEL_MESSAGE_KEY, channel.id, sent.id);
  return sent;
}

// ---------- Helpers ----------

// Staff = the configured ticket staff role, the mod role, or an administrator.
export function isTicketStaff(member) {
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  const staffRoleId = config.tickets.staffRoleId;
  if (staffRoleId && member.roles?.cache?.has?.(staffRoleId)) return true;
  if (config.modRoleId && member.roles?.cache?.has?.(config.modRoleId)) return true;
  return false;
}

// The ticket row for a channel (only open tickets are actionable).
export function getTicketForChannel(guildId, channelId) {
  const row = getTicketByChannel(guildId, channelId);
  return row?.status === 'open' ? row : null;
}

// Owner of the ticket or staff - allowed to rename/add/remove/close.
export function canManageTicket(ticket, member) {
  if (!member) return false;
  return member.id === ticket.owner_id || isTicketStaff(member);
}

const sanitizeTicketName = (name) =>
  `ticket-${String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')}`
    .slice(0, 100)
    .replace(/-+$/, '') || 'ticket';

// ---------- Open ----------

// Creates the ticket channel in the same category as the panel channel.
// Uses the GuildMember from the button interaction; reply payloads are returned for the caller.
export async function openTicket(interaction, client) {
  const guild = interaction.guild;

  const existing = getOpenTicketByOwner(guild.id, interaction.user.id);
  if (existing) {
    return { error: `You already have an open ticket: <#${existing.channel_id}>. Close it first or use that one.` };
  }

  const staffRoleId = config.tickets.staffRoleId;

  const overwrites = [{ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] }];
  overwrites.push({ id: interaction.user.id, allow: TICKET_MEMBER_ALLOW });
  if (staffRoleId) {
    overwrites.push({ id: staffRoleId, allow: TICKET_MEMBER_ALLOW });
  }

  if (!guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return { error: 'The bot is missing the **Manage Channels** permission - a ticket channel cannot be created.' };
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: sanitizeTicketName(interaction.user.username),
      type: ChannelType.GuildText,
      parent: interaction.channel?.parentId ?? undefined,
      permissionOverwrites: overwrites,
      reason: `Ticket opened by ${interaction.user.id}`,
    });
  } catch (err) {
    console.error('[tickets] Channel creation failed:', err.message);
    return { error: `Could not create the ticket channel: ${err.message}` };
  }

  const ticket = createTicketRow({ guildId: guild.id, channelId: channel.id, ownerId: interaction.user.id });

  const intro = baseEmbed(COLORS.audit)
    .setTitle('Ticket')
    .setDescription(
      [
        `Opened by <@${interaction.user.id}> - support will reply here.`,
        staffRoleId ? `Visible to: <@${interaction.user.id}> and <@&${staffRoleId}>.` : 'Visible to: you and the staff team.',
        'Commands: `/rename` • `/close` • `/add` • `/remove` (or `=rename`, `=close`, `=add`, `=remove`).',
        'When you are done, use `/close` - the channel is then removed.',
      ].join('\n'),
    )
    .setFooter({ text: guild.name })
    .setTimestamp(Date.now());

  await channel
    .send({
      embeds: [intro],
      allowedMentions: { roles: staffRoleId ? [staffRoleId] : [] },
    })
    .catch(() => {});

  const staffPing = staffRoleId ? `<@&${staffRoleId}>` : null;
  if (staffPing) {
    await channel.send({ content: staffPing, allowedMentions: { roles: [staffRoleId] } }).catch(() => {});
  }

  return { ticket, channel };
}

// ---------- Rename / Add / Remove / Close ----------

export async function renameTicket(guild, ticket, newName, member) {
  const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (!channel) return { error: 'The ticket channel no longer exists.' };

  const clean = sanitizeTicketName(newName).replace(/^ticket-/, '').replace(/^-+|-+$/g, '');
  if (!clean) return { error: 'The new name produced an empty channel name.' };

  try {
    await channel.setName(sanitizeTicketName(clean), `Ticket renamed by ${member.id}`);
  } catch (err) {
    return { error: `Could not rename the channel: ${err.message}` };
  }

  await channel
    .send({ embeds: [baseEmbed(COLORS.info).setDescription(`Channel renamed by <@${member.id}>.`)] })
    .catch(() => {});
  return { channel };
}

// Accepts a Member, a Role or a raw User, adds it to the ticket overwrites and announces it.
export async function addToTicket(guild, ticket, target, member) {
  const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (!channel) return { error: 'The ticket channel no longer exists.' };

  try {
    await channel.permissionOverwrites.edit(target.id, { allow: TICKET_MEMBER_ALLOW }, { reason: `Added to ticket by ${member.id}` });
  } catch (err) {
    return { error: `Could not update the channel permissions: ${err.message}` };
  }

  const label = target instanceof Role ? `<@&${target.id}>` : `<@${target.id}>`;
  await channel
    .send({ embeds: [baseEmbed(COLORS.info).setDescription(`${label} was added to this ticket by <@${member.id}>.`)] })
    .catch(() => {});
  return { channel };
}

export async function removeFromTicket(guild, ticket, target, member) {
  const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (!channel) return { error: 'The ticket channel no longer exists.' };

  // The owner cannot be removed - the ticket would become unusable for them.
  if (target.id === ticket.owner_id) {
    return { error: 'The ticket owner cannot be removed from their own ticket.' };
  }

  try {
    await channel.permissionOverwrites.delete(target.id, `Removed from ticket by ${member.id}`);
  } catch (err) {
    return { error: `Could not update the channel permissions: ${err.message}` };
  }

  const label = target instanceof Role ? `<@&${target.id}>` : `<@${target.id}>`;
  await channel
    .send({
      embeds: [baseEmbed(COLORS.warn).setDescription(`${label} was removed from this ticket by <@${member.id}>.`)],
    })
    .catch(() => {});
  return { channel };
}

// Posts the closing embed, marks the row closed, logs to the mod log and removes the channel.
export async function closeTicket(guild, ticket, member, note, client) {
  const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (!channel) return { error: 'The ticket channel no longer exists.' };

  await closeTicketRow(ticket.id, { closedBy: member.id, note: note ? truncate(note, 500) : null });

  await channel
    .send({
      embeds: [
        baseEmbed(COLORS.warn)
          .setDescription(
            [
              `**Ticket closed** by <@${member.id}>.`,
              note ? `Note: ${truncate(note, 400)}` : null,
              'This channel will be removed shortly.',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
      ],
    })
    .catch(() => {});

  const owner = await guild.members.fetch(ticket.owner_id).catch(() => null);
  await sendModLog(
    guild,
    buildAuditEmbed({
      title: 'Ticket Closed',
      description: `Ticket <#${channel.id}> - opened by ${owner ? `<@${owner.id}>` : `<@${ticket.owner_id}>`} - closed by <@${member.id}>.`,
      color: COLORS.warn,
      fields: note ? [{ name: 'Note', value: truncate(note, 400) }] : [],
    }),
  );

  setTimeout(() => {
    channel.delete(`Ticket closed by ${member.id}`).catch(() => {});
  }, 4000);

  return { closed: true };
}
