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
| Do-not-type trap | Any message posted in `doNotType.channelId` is logged with a mod-role ping. Optionally auto-`mute` / `kick` / `ban` the author (never applied to real bot accounts - alert only). |

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
  "doNotType": {
    "channelId": "123...",        // the "do not type here" channel
    "action": "alert"             // alert | mute | kick | ban
  },
  "warnEscalation": {
    "threshold": 0,               // active warnings needed to auto-mute (0 = off)
    "duration": "1h"              // auto-mute duration
  }
}
```

`config.json` is read at startup and **written back** when the bot auto-creates the Muted role, so `muteRoleId` fills itself in.

## Setup

### 1. Create the bot

1. Developer Portal -> **New Application**.
2. **Bot** tab -> **Reset Token** -> copy the token into `.env`.
3. **Bot** tab -> enable **Server Members Intent** and **Message Content Intent** (both required).
4. **General Information** tab -> copy the **Application ID** into `.env`.

### 2. Invite the bot

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268520582&scope=bot%20applications.commands
```

Includes: View Channels, Send Messages, Embed Links, Read Message History, Manage Roles, Kick Members, Ban Members, View Audit Log.

> Move the bot's role **above** the `Muted` role in Server Settings -> Roles.

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
/setup
```

Creates/uses the Muted role, applies restrictions to every existing channel, and prints a summary. New channels are restricted automatically.

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
| `=puns` / `=h` / `=history` / `=punishments <user> [type]` | Punishment history with page buttons. |
| `=offences [user]` | Offence count (no user = top 10). |
| `=case <number>` | View a case. |
| `=help` | List prefix commands. |

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
| `/setup` | Create Muted role + apply channel restrictions. |

> Users with the configured `modRoleId` (or Administrators) can use every command; otherwise the matching Discord permission is required (Manage Roles, Kick Members, Ban Members, Manage Messages, Manage Server).

## How it works

### Cases

- Every action creates a numbered case (`Case #12`, per server) - including automatic mutes, unmutes, unbans and notes.
- `status` is `active`, `expired` (timer ran out) or `removed` (undone early / cleared). History shows the matching dot: 🟢 Active, ⚪ Expired/Removed.
- `offence_no` counts only warn/mute/kick/ban cases and is shown as `(Offence #N)` next to the reason.
- `/case delete` sets `hidden = 1` - the case disappears from history but stays in the database.

### Mute

- A role alone cannot remove permissions, so the bot denies `Send Messages`, `Add Reactions`, `Create Threads`, `Speak`, ... via **channel overwrites** for the Muted role (`/setup` applies them everywhere; new channels are handled by the `channelCreate` event).
- Temporary mutes are stored with `expires_at` and re-scheduled on boot; expiring mutes have the role removed automatically and the case marked `expired`.

### Logging

- Bot actions -> full case embed in the mod log channel.
- Out-of-band actions (ban/kick/unban/timeout/manual Muted role changes done in the Discord UI) -> caught via `guildAuditLogEntryCreate` and logged with the executor, tagged `(out of band)`.
- Do-not-type channel messages -> alert embed with a ping to `modRoleId`, plus the optional automatic action.

## Project structure

```
config.json               # bot configuration (IDs, prefix, traps)
.env                      # secrets only (token, client id)
src/
├── index.js              # boot: intents, loaders, login
├── deploy-commands.js    # global slash command registration
├── config.js             # .env + config.json loader (writes muteRoleId back)
├── constants.js          # colors, type metadata, statuses, limits
├── db.js                 # SQLite schema + queries (cases, offences)
├── commands/             # slash commands
├── events/               # ready, interactionCreate, messageCreate, guildMemberAdd,
│                         # guildAuditLogEntryCreate, channelCreate
├── prefix/
│   ├── handler.js        # =commands dispatcher (mute, puns, ...)
│   └── doNotType.js      # do-not-type channel trap
├── services/
│   ├── mutes.js          # Muted role + overwrites + assign/remove
│   ├── scheduler.js      # temp mute/ban timers (restored on boot)
│   ├── escalation.js     # auto-mute on warning threshold
│   ├── historyCommand.js # shared /history + /punishments implementation
│   └── log.js            # mod log sender
└── utils/                # duration, embeds, permissions, paginate, loaders
data/bot.sqlite           # database (auto-created, gitignored)
```

## Operational notes

- **Muted role deleted?** The bot recreates it (and updates `muteRoleId` in config.json) on the next mute; run `/setup` to re-sync channel overwrites.
- **Logs not sent?** Check `modLogChannelId` and that the bot can Send Messages + Embed Links there.
- **Backup:** copy `data/bot.sqlite` (plus `-wal` while running).
- **Slash commands missing?** Global commands can take up to an hour to appear; re-run `npm run deploy`.

## Roadmap ideas

- [ ] Message log (edit/delete)
- [ ] Appeal flow / DM notifications
- [ ] Rule database (rule IDs in cases)
- [ ] Web dashboard
