# Moderation Bot

Discord moderation bot with **role-based mutes**, **warnings + offence count**, **punishment history** (`=puns`), **mod log / audit log** (including out-of-band Discord actions) and a **do-not-type channel trap** to catch bots/selfbots.

- **Stack:** Node.js + discord.js v14
- **Database:** SQLite via the built-in `node:sqlite` module (no native modules, no DB server)
- **Commands:** Slash commands (global) + prefix commands (`=`)
- **Language:** all code, comments, embeds and messages in English

## Features

| Area | Details |
| --- | --- |
| Mute | Assign/remove the `Muted` role with per-channel restrictions. Temporary (`=mute 123 3d spam`) or permanent (`=mute 123 spam`). Expiry is scheduled and restored after restarts. Muted members who rejoin get re-muted automatically. |
| Warnings | `=warn`, `/warnings list`, `/warnings clear`. Optional automatic mute when a user reaches the configured warning threshold (`warnEscalation` in config.json). |
| Offence count | Every warn/mute/kick/ban creates a numbered case and increases the user's offence number. `=offences` shows a user's breakdown or the top 10 offenders. |
| Punishment history | `=puns <user>` / `=h` / `=history` / `=punishments` and `/history` `/punishments` - paginated embeds in the `Punishments • user • Page x of y` style with Previous/Next buttons. |
| Mod log | Every bot action (including automatic ones) is logged to `modLogChannelId` as a case embed. |
| Audit log | Ban / unban / kick / timeout / manual Muted-role changes performed directly in Discord are caught via the audit log and logged with the executor. |
| Temp ban | `/ban user duration:` or `=ban <user> <duration> [reason]` - unbanned automatically on expiry. |
| Do-not-type trap | Any message posted in `doNotType.channelId` is logged with a mod-role ping and the author is auto-**kicked** by default (`action: kick`; alternatives `alert` / `mute` / `ban` - never applied to real bot accounts, those only trigger the alert). The channel always stays **open to `@everyone`** so bots, selfbots and people without the Member role are caught too. A kicked user also has **every message they sent in the last 30 minutes purged server-wide** (`doNotType.purgeMinutes`, 0 = off). A persistent **Warning** sticker with live counter buttons (Caught / Muted / Kicked / Banned) is kept in the channel automatically. |
| Muted-commands channel | `mutedBotCmdsChannelId` is **visible to muted users and staff only** (`@everyone` is locked out; muted users + mods + the bot keep explicit allows) so muted users can still use bot commands there (`=puns` / `/history` on themselves, `=help`). A notice embed is kept in the channel automatically. |
| Roles | `/install` creates the whole role stack: **Muted** (above Member, hidden look), **Member**, **Bots** and the visible bot identity role - both below Member with stripped permissions - plus the hidden **Bot Perms** role (`Administrator`). |
| Bot status | A live **Status Report** card (Components V2) in `botStatusChannelId`: Bot Status (CPU cores/usage, memory, uptime), Environment (Node.js / discord.js / platform / bot version) and Websocket (ping, shards, state). Refreshed every minute. |
| Server stats | A live **Server Report** card in `serverStatsChannelId`: Members (All / Humans / Bots), Online (live counts - needs the Presence Intent) and Server (Boosts, Channels, Roles, Created date). Optionally keeps a voice channel (`serverStatsVoiceChannelId`) automatically renamed to `All Members: N` (throttled to Discord's 2-renames/10-minutes limit). |
| Tickets | One-button panel in `tickets.panelChannelId` (basic text, no command list). Pressing **Open Ticket** creates a text channel in the same category, visible only to the opener and `tickets.staffRoleId`. The opener is welcomed with a **Ticket** card, the opener and staff role are mentioned and the only button is **Close Ticket**. `rename` / `add` / `remove` are ticket-staff only; `close` also works for the owner. One open ticket per user. |
| Create Voice | A lobby voice channel (`createVoice.lobbyChannelId`) that spawns a personal voice channel on join, in the same category. Its text chat gets a **Voice Channel** panel: privacy toggle (Public/Private), user limit select, and a member-invite select. Only the channel owner or staff may use the panel. Ownership passes to the first remaining member when the owner leaves; the channel is deleted when it empties. |
| Install / Uninstall | `/install` checks every configured role/channel, applies the setup and posts/refreshes the setup messages (overwrites existing ones). `/uninstall` deletes those messages again. |

## Requirements

- **Node.js >= 23.4** (Node 24+ recommended; needs `node:sqlite` and `--env-file`)
- A Discord application ([Developer Portal](https://discord.com/developers/applications))

## Configuration

Configuration is split in two files:

### `.env` - secrets only

```env
DISCORD_TOKEN=__REDACTED__
CLIENT_ID=__REDACTED__
```

### `config.json` - everything else

```jsonc
{
  "prefix": "=",                  // prefix for text commands
  "guildId": "123...",            // your server ID (the bot only works here)
  "muteRoleId": "123...",         // Muted role ID (leave empty to auto-create on first mute)
  "muteRoleName": "Muted",        // name used when the bot creates the role
  "modRoleId": "123...",          // role allowed to use moderation commands
  "modLogChannelId": "123...",    // channel receiving all logs
  "memberRoleId": "123...",       // Member role ID (leave empty; /install auto-creates it)
  "memberRoleName": "Member",     // name used when the bot creates the member role
  "botsRoleId": "123...",         // shared role for bot accounts (auto-created by /install)
  "botsRoleName": "Bots",         // name used when the bot creates the bots role
  "botRoleId": "123...",          // visible bot identity role (no powers, below Member)
  "botRoleName": "Moderation Bot", // name used when the bot creates its own role
  "botPermsRoleId": "123...",     // hidden Administrator role (auto-created, position does not matter)
  "botPermsRoleName": "Bot Perms", // name used when the bot creates the hidden perms role
  "mutedBotCmdsChannelId": "123...", // channel muted users can still talk in to use commands
  "botStatusChannelId": "123...", // channel receiving the live "Status Report" card
  "serverStatsChannelId": "123...", // channel receiving the live "Server Report" card
  "serverStatsVoiceChannelId": "123...", // optional voice channel auto-renamed to "All Members: N"
  "doNotType": {
    "channelId": "123...",        // the "do not type here" channel
    "action": "kick",             // kick (default) | alert | mute | ban
    "purgeMinutes": 30            // wipe the kicked user's messages from the last N minutes (0 = off)
  },
  },
  "tickets": {
    "panelChannelId": "",          // channel hosting the Open-Ticket button; tickets open in its category
    "staffRoleId": ""              // role that can see and manage every ticket
  },
  "createVoice": {
    "lobbyChannelId": ""           // voice channel users join to spawn a personal voice channel
  },
  "warnEscalation": {
    "threshold": 0,               // active warnings needed to auto-mute (0 = off)
    "duration": "1h"              // auto-mute duration
  }
}
```

`config.json` is read at startup and **written back** when the bot auto-creates roles, so `muteRoleId`, `memberRoleId`, `botsRoleId` and `botRoleId` fill themselves in.

## Setup

### 1. Create the bot

1. Developer Portal -> **New Application**.
2. **Bot** tab -> **Reset Token** -> copy the token into `.env`.
3. **Bot** tab -> enable **Server Members Intent**, **Message Content Intent** and **Presence Intent** (Presence is needed for the live online counts on the Server Report card).
4. **General Information** tab -> copy the **Application ID** into `.env`.

### 2. Invite the bot

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

Grants **Administrator**. That is intentional: an Administrator bot ignores Discord's role-position limits, so the hidden perms role can rest at the bottom of the role list while the visible bot roles stay below Member. (Alternative: invite with the granular permission set and drag the perms role above Member instead.)

> `/install` creates the roles above and tries to fix their order automatically; with Administrator the bot can manage every role, so no manual dragging is required. Assign the hidden **Bot Perms** role to the bot once (or re-invite with the Administrator link so `/install` can do it).

### 3. Run

```bash
npm install
cp .env.example .env          # fill in DISCORD_TOKEN + CLIENT_ID
# edit config.json: guildId, modLogChannelId, modRoleId, doNotType.channelId...
npm run deploy                # register global slash commands
npm start
```

### 4. In the server

```
/install
```

Checks every configured role/channel, creates the role stack (Muted, Member, Bots, bot identity, hidden Bot Perms) when missing, applies the channel restrictions, posts the setup messages (the Warning sticker in the do-not-type channel, the notice in the muted-commands channel, the Status Report card in the bot-status channel and the Server Report card in the server-stats channel) and prints a summary embed. The embed includes the server the bot operates in, one status row per role/channel and a final **Report** field listing everything that is not ready yet (`Not set` / `Failed`). Re-running it overwrites/refreshes everything. `/uninstall` deletes the setup messages again.

## Commands

### Prefix (`=`)

| Command | Description |
| --- | --- |
| `=mute <uid\|mention\|name> <duration> [reason]` | Mute a member. Duration: `5m`, `2h`, `3d`, `1d12h`, `perm`. Omit duration = permanent. |
| `=unmute <user> [reason]` | Remove the mute. |
| `=kick <user> [reason]` | Kick a member. |
| `=ban <user> [duration] [reason]` | Ban (duration optional = temp ban). |
| `=unban <user id> [reason]` | Remove a ban. |
| `=warn <user> [reason]` | Warn a member. |
| `=warnings list <user>` / `=warnings clear <user> [reason]` | View / clear warnings. |
| `=puns` / `=h` / `=history` / `=punishments <user> [type]` | Punishment history with page buttons. |
| `=offences [user]` | Offence count (no user = top 10). |
| `=case <number>` / `=case delete <number> [reason]` | View / hide a case. |
| `=rename <new name>` | Rename this ticket (in ticket channels). |
| `=close [note]` | Close this ticket (channel is removed). |
| `=add <@user|@role>` | Grant ticket access. |
| `=remove <@user|@role>` | Revoke ticket access. |
| `=setup` | Create the Muted role + apply channel restrictions. |
| `=install` | Full setup check: roles, channels, restrictions, setup messages. |
| `=uninstall` | Delete the setup messages the bot posted in channels. |
| `=help` | List prefix commands. |

> Every slash command has a prefix equivalent (`=install` = `/install`, ...).

Examples:

```
=mute 134029771369230409 14d Negative Use of Disabilities
=mute @GreedNot 5m spam
=mute GreedNot perm ban evasion
=puns 803207908203429938
```

Targets accept a **user ID**, a **mention** (`<@123...>`) or a **username**.

### Slash (global)

| Command | Description |
| --- | --- |
| `/mute user duration: reason:` | Mute (same rules as prefix). |
| `/unmute user reason:` | Unmute. |
| `/kick user reason:` | Kick. |
| `/ban user duration: reason: delete_messages:` | Ban / temp ban. |
| `/unban user_id reason:` | Unban. |
| `/warn user reason:` | Warn. |
| `/history user type:` and `/punishments user type:` | Punishment history. |
| `/offences [user]` | Offence count / top 10. |
| `/case view|delete number:` | View or hide a case. |
| `/warnings list|clear user:` | Manage warnings. |
| `/rename name:` | Rename this ticket channel (owner/staff only, in ticket channels). |
| `/close note:` | Close this ticket - the channel is removed shortly after. |
| `/add user: / role:` | Grant a user or role access to this ticket. |
| `/remove user: / role:` | Revoke ticket access. |
| `/setup` | Create Muted role + apply channel restrictions. |
| `/install` | Full setup check: roles, channels, restrictions, setup messages. |
| `/uninstall` | Delete the setup messages the bot posted in channels. |

Note: inside the muted-commands channel, muted users can run `/history` / `/punishments` (and `=puns`) on **themselves** without moderator permissions.

> Users with the configured `modRoleId` (or Administrators) can use every command **except `/ban`, `=ban`, `/kick`, `=kick`** - those require the real Discord **Ban Members** / **Kick Members** permission. All other commands fall back to the matching Discord permission (Manage Roles, Manage Messages, Manage Server).

## How it works

### Cases

- Every action creates a numbered case (`Case #12`, per server) - including automatic mutes, unmutes, unbans and notes.
- `status` is `active`, `expired` (timer ran out) or `removed` (undone early / cleared). History shows the label next to `**Status:**`.
- `offence_no` counts only warn/mute/kick/ban cases and is shown as `(Offence #N)` next to the reason.
- `/case delete` sets `hidden = 1` - the case disappears from history but stays in the database.

### Roles

`/install` makes sure these roles exist, ordered top to bottom in the role list:
1. **Muted** (`muteRoleName`) - positioned **above Member** so it wins over member roles, but kept invisible: no colour (muted usernames stay their default colour) and never shown separately. Chatting is denied via channel overwrites.
2. **Member** (`memberRoleName`) - basic access: `View Channels`, `Send Messages`, `Read Message History`. Assigned automatically to every human who joins. Restricted categories/channels stay configured by you in Discord.
3. **Bots** (`botsRoleName`) - shared role for bot accounts, **below Member**. Assigned to every bot already in the server and to every bot that joins later.
4. **Bot identity role** (`botRoleName`, e.g. `SENTIA`) - the visible bot role, **below Member** - `/install` strips its permissions **and un-hoists it**, so the bot no longer gets its own group at the top of the member list; it appears under the normal online section.
5. **Bot Perms** (`botPermsRoleName`, default `Bot Perms`) - **hidden, colourless, not hoisted** role that carries exactly one permission: **Administrator**. Because the bot ignores role positions as Administrator, this role can rest at the very bottom of the list; it never shows in member profiles.

### Mute

- A role alone cannot remove permissions, so the bot denies `Send Messages`, `Add Reactions`, `Create Threads`, `Speak`, ... via **channel overwrites** for the Muted role (`/install` / `/setup` apply them everywhere; new channels are handled by the `channelCreate` event).
- Temporary mutes are stored with `expires_at` and re-scheduled on boot; expiring mutes have the role removed automatically and the case marked `expired`.

### Muted-commands channel

- `mutedBotCmdsChannelId` is **sealed for everyone else**: `@everyone` loses `View Channel` / `Send Messages` there, while the Muted role keeps explicit allows (view + chat + slash commands), the mod role keeps read/write access and the bot itself can still post its notice.
- The bot keeps a notice embed in that channel ("You are muted ... use `=puns` to view your own history").
- Self-service: inside that channel only, a muted user can run `=puns` / `=h` / `=history` / `=punishments` (no arguments = themselves) and `/history` `/punishments` on themselves without any moderator permission. Everything else still requires permissions.
- Re-run `/install` after changing `mutedBotCmdsChannelId`; the `channelCreate` event reshuffles the same restrictions if it is ever recreated.

### Logging

- Bot actions -> full case embed in the mod log channel.
- Out-of-band actions (ban/kick/unban/timeout/manual Muted role changes done in the Discord UI) -> caught via `guildAuditLogEntryCreate` and logged with the executor, tagged `(out of band)`.
- Do-not-type channel messages -> alert embed with a ping to `modRoleId`, plus the optional automatic action.

### Do-not-type channel

- The channel must be **typeable by everyone to work**: `/install` grants `@everyone` an explicit allow (`View Channel`, `Send Messages`, `Read Message History`), so bots, selfbots and brand-new joins without the Member role all trigger the catch. The bot itself also gets an explicit allow to keep posting the Warning sticker. users with the Muted role stay blocked (they are muted already).
- On startup (and after every catch) the bot posts/updates a **Warning** message in `doNotType.channelId`:
  `Warning` + "DO NOT POST MESSAGES IN THIS CHANNEL, you will be {muted/kicked/banned} from {server} if you do so!" + "This channel is used to catch bots that spam our server."
- Below it, counter buttons track `Caught`, `Muted`, `Kicked`, `Banned` (counters persist in the database; action buttons appear once used). No emoji anywhere in the UI.
- Every caught message is logged to the mod log channel with the author, content preview and a jump link.
- When the trap action is `kick`, the author is kicked and the bot then **purges every message they sent in the last `purgeMinutes` minutes** (default 30) across all channels and active threads it can manage (needs Manage Messages). The result ("Deleted N message(s) from the last 30 minutes in M channel(s).") is shown in the alert embed's `History cleanup` field.

### Tickets

- `tickets.panelChannelId` hosts the panel: a Components V2 card ("Tickets") with a **single** `Open Ticket` button - no multi-button panel.
- The button creates `ticket-<username>` as a **text channel in the same category as the panel**, with overwrites: `@everyone` denied, the opener and `tickets.staffRoleId` allowed (view/write/attach/embed). The bot itself keeps access to manage the channel.
- One open ticket per user - pressing the button again points to the existing channel.
- Welcome card in the new channel: `Ticket` (green accent) - "Welcome @user." - footer note "pinging staff can result in a permanent ticket ban" - the opener and the staff role are mentioned and the only button is **Close Ticket** (no claim button).
- Permissions: `rename` / `add` / `remove` are **ticket-staff only**; `close` is owner or staff (also via the button).
- Inside the ticket (owner or staff): `/rename` (auto `ticket-` prefix, sanitized), `/add` and `/remove` for users or roles, `/close [note]`: marks the row closed, announces it, writes a **Ticket Closed** entry to the mod log (with the note) and deletes the channel a few seconds later.
- Everything is stored in the `tickets` table (owner, status, who closed, note, timestamps).

### Create Voice

- `createVoice.lobbyChannelId` is the trigger channel (for example named `Create Voice`). Joining it spawns `<username>'s VC` as a **voice channel in the same category** and moves the joiner there; joining again reconnects that member to their own channel instead of spawning a second one.
- The new channel's text chat carries a **Voice Channel** panel (plain embed, no emoji) with three controls: `Set Private`/`Set Public` (private denies `@everyone` view and connect; the owner and invited members keep access), a `User Limit` select (Unlimited, 2, 3, 4, 5, 6, 8, 10) and an `Invite a member` user select (up to five at once; the mention is announced in the chat).
- Panel use is restricted to the **channel owner or staff** (ticket staff role / mod role / administrator). Speak permission is never force-granted, so a server-wide mute stays effective.
- When the owner leaves, ownership transfers to the first remaining member and the panel re-renders. When the channel empties, it is **deleted automatically** and its row is removed from the `voice_channels` table.

### Bot status channel

- The bot keeps a **Status Report** card (Components V2, `[ • ]` section style, no emoji) in `botStatusChannelId` and edits it every minute:
  `Bot Status` (CPU cores/usage, Mem Max, Mem Use, Uptime) - `Environment` (Node JS, Discord JS, Platform, Bot version) - `Websocket` (Ping, Shards, State).
- Posted/refreshed by `/install`, restored on startup, removed by `/uninstall`. Keeping only these three sections is intentional (no queue/arena/plugin noise).

### Server stats channel

- The same report style in `serverStatsChannelId`, titled **Server Report** and edited every minute:
  `Members` (All Members, Humans, Bots) - `Online` (Online, Idle, Do Not Disturb, Offline - live from presences; enable the **Presence Intent** in the Developer Portal, otherwise it says unavailable) - `Server` (Boosts + Tier, Channels text/voice, Roles, Created date).
- Optional: put the ID of the "All Members" voice channel into `serverStatsVoiceChannelId` and the bot renames it to `All Members: {total}` whenever the count changes (respecting Discord's rename rate limit, so up to 10 minutes late).

## Project structure

```
config.json               # bot configuration (IDs, prefix, traps)
.env                      # secrets only (token, client id)
src/
├── index.js              # boot: intents, loaders, login
├── deploy-commands.js    # global slash command registration
├── config.js             # .env + config.json loader (writes role IDs back)
├── constants.js          # colors, type metadata, statuses, limits
├── db.js                 # SQLite schema + queries (cases, offences)
├── commands/             # slash commands
├── events/               # ready, interactionCreate, messageCreate, guildMemberAdd, voiceStateUpdate,
│                         # guildAuditLogEntryCreate, channelCreate
├── prefix/
│   ├── handler.js        # =commands dispatcher (mute, puns, ...)
│   └── doNotType.js      # do-not-type channel trap
├── services/
│   ├── mutes.js          # Muted role + overwrites + assign/remove
│   ├── roles.js           # Member / Bots / Moderation Bot roles (auto-created, assigned on join)
│   ├── install.js        # /install + /uninstall (setup checks, setup messages)
│   ├── status.js          # bot status card (Bot Status / Environment / Websocket)
│   ├── serverstats.js     # server stats card (Members / Online / Server) + All-Members voice sync
│   ├── tickets.js         # ticket system (panel, open/rename/add/remove/close)
│   ├── createvoice.js     # create-voice lobby (spawn personal VC, privacy/limit/invite panel)
│   ├── trap.js           # do-not-type Warning message + counters
│   ├── scheduler.js      # temp mute/ban timers (restored on boot)
│   ├── escalation.js     # auto-mute on warning threshold
│   ├── historyCommand.js # shared /history + /punishments implementation
│   └── log.js            # mod log sender
└── utils/                # duration, embeds, permissions, paginate, loaders
data/bot.sqlite           # database (auto-created, gitignored)
```

## Operational notes

- **Muted role deleted?** The bot recreates it (and updates `muteRoleId` in config.json) on the next mute; run `/install` to re-sync channel overwrites.
- **Changed config IDs?** Run `/install` again - it re-checks everything and refreshes/overwrites the setup messages.
- **Logs not sent?** Check `modLogChannelId` and that the bot can Send Messages + Embed Links there.
- **Backup:** copy `data/bot.sqlite` (plus `-wal` while running).
- **Slash commands missing?** Global commands can take up to an hour to appear; re-run `npm run deploy`.

## Roadmap ideas

- [ ] Message log (edit/delete)
- [ ] Appeal flow / DM notifications
- [ ] Rule database (rule IDs in cases)
- [ ] Web dashboard
