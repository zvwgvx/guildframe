// SQLite access layer. Uses the built-in node:sqlite module (no native dependencies).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { OFFENCE_TYPES } from './constants.js';

const dbFile = path.resolve(config.dbPath);
mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS cases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  case_number   INTEGER NOT NULL,
  user_id       TEXT NOT NULL,
  moderator_id  TEXT NOT NULL,
  type          TEXT NOT NULL,
  reason        TEXT,
  duration_ms   INTEGER,
  expires_at    INTEGER,
  status        TEXT NOT NULL DEFAULT 'active',
  offence_no    INTEGER,
  hidden        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  UNIQUE (guild_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_cases_user   ON cases (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (guild_id, status, type);
CREATE INDEX IF NOT EXISTS idx_cases_temp   ON cases (status, expires_at);

CREATE TABLE IF NOT EXISTS trap_stats (
  guild_id TEXT NOT NULL,
  key      TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS install_messages (
  guild_id   TEXT NOT NULL,
  key        TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, key)
);
`);

// Migration from the initial schema (active flag -> status, offence numbering).
const columns = db.prepare('PRAGMA table_info(cases)').all().map((c) => c.name);
if (!columns.includes('status')) {
  db.exec("ALTER TABLE cases ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  db.exec("UPDATE cases SET status = CASE WHEN active = 1 THEN 'active' ELSE 'removed' END");
}
if (!columns.includes('offence_no')) {
  db.exec('ALTER TABLE cases ADD COLUMN offence_no INTEGER');
}
// The old per-guild config table is superseded by config.json.
db.exec('DROP TABLE IF EXISTS guild_config');

// Older installs tracked only the trap message; migrate it into install_messages.
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
if (tables.includes('trap_message')) {
  db.exec(
    `INSERT OR REPLACE INTO install_messages (guild_id, key, channel_id, message_id)
     SELECT guild_id, 'trap', channel_id, message_id FROM trap_message`,
  );
  db.exec('DROP TABLE trap_message');
}

// ---------- Cases ----------

const OFFENCE_SQL = "('warn','mute','kick','ban')";

export function createCase({
  guildId,
  userId,
  moderatorId,
  type,
  reason = null,
  durationMs = null,
  createdAt = Date.now(),
}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const { n } = db
      .prepare('SELECT COALESCE(MAX(case_number), 0) + 1 AS n FROM cases WHERE guild_id = ?')
      .get(guildId);

    let offenceNo = null;
    if (OFFENCE_TYPES.includes(type)) {
      const prev = db
        .prepare(
          `SELECT COALESCE(MAX(offence_no), 0) + 1 AS n FROM cases
           WHERE guild_id = ? AND user_id = ? AND type IN ${OFFENCE_SQL}`,
        )
        .get(guildId, userId);
      offenceNo = prev.n;
    }

    const expiresAt = durationMs ? createdAt + durationMs : null;
    const info = db
      .prepare(
        `INSERT INTO cases
          (guild_id, case_number, user_id, moderator_id, type, reason, duration_ms, expires_at, status, offence_no, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .run(guildId, n, userId, moderatorId, type, reason, durationMs, expiresAt, offenceNo, createdAt, createdAt);

    db.exec('COMMIT');
    return getCaseById(Number(info.lastInsertRowid));
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const getCaseById = (id) => db.prepare('SELECT * FROM cases WHERE id = ?').get(id) ?? null;

export const getCaseByNumber = (guildId, caseNumber) =>
  db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_number = ?').get(guildId, caseNumber) ??
  null;

export function listCases({ guildId, userId = null, type = null, limit = 5, offset = 0 }) {
  const where = ['guild_id = ?', 'hidden = 0'];
  const params = [guildId];
  if (userId) {
    where.push('user_id = ?');
    params.push(userId);
  }
  if (type && type !== 'all') {
    where.push('type = ?');
    params.push(type);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM cases WHERE ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM cases WHERE ${whereSql} ORDER BY case_number DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { rows, total };
}

export const countActiveByType = (guildId, userId, type) =>
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM cases WHERE guild_id = ? AND user_id = ? AND type = ? AND status = 'active' AND hidden = 0",
    )
    .get(guildId, userId, type).n;

export function getActiveCases(guildId, userId, type = null) {
  const base =
    "SELECT * FROM cases WHERE guild_id = ? AND user_id = ? AND status = 'active' AND hidden = 0";
  return type
    ? db.prepare(`${base} AND type = ? ORDER BY id DESC`).all(guildId, userId, type)
    : db.prepare(`${base} ORDER BY id DESC`).all(guildId, userId);
}

export const getActiveTempCases = () =>
  db
    .prepare(
      "SELECT * FROM cases WHERE status = 'active' AND hidden = 0 AND expires_at IS NOT NULL AND type IN ('mute', 'ban')",
    )
    .all();

// Mark a single case as expired (timer elapsed) or removed (manually undone / cleared).
export const setCaseStatus = (id, status) =>
  Number(
    db.prepare('UPDATE cases SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id)
      .changes,
  );

export const setActiveCasesStatus = (guildId, userId, type, status) =>
  Number(
    db
      .prepare(
        "UPDATE cases SET status = ?, updated_at = ? WHERE guild_id = ? AND user_id = ? AND type = ? AND status = 'active'",
      )
      .run(status, Date.now(), guildId, userId, type).changes,
  );

export const hideCase = (id) =>
  Number(db.prepare('UPDATE cases SET hidden = 1, updated_at = ? WHERE id = ?').run(Date.now(), id).changes);

// ---------- Offences ----------

export const offenceBreakdown = (guildId, userId) =>
  db
    .prepare(
      `SELECT type, COUNT(*) AS count, MAX(created_at) AS last_at
       FROM cases
       WHERE guild_id = ? AND user_id = ? AND hidden = 0 AND type IN ${OFFENCE_SQL}
       GROUP BY type`,
    )
    .all(guildId, userId);

export const topOffenders = (guildId, limit = 10) =>
  db
    .prepare(
      `SELECT user_id, COUNT(*) AS count
       FROM cases
       WHERE guild_id = ? AND hidden = 0 AND type IN ${OFFENCE_SQL}
       GROUP BY user_id
       ORDER BY count DESC, user_id ASC
       LIMIT ?`,
    )
    .all(guildId, limit);

// ---------- Do-not-type trap ----------

export function bumpTrapStat(guildId, key) {
  db.prepare(
    `INSERT INTO trap_stats (guild_id, key, count) VALUES (?, ?, 1)
     ON CONFLICT (guild_id, key) DO UPDATE SET count = count + 1`,
  ).run(guildId, key);
}

export const getTrapStats = (guildId) => {
  const rows = db.prepare('SELECT key, count FROM trap_stats WHERE guild_id = ?').all(guildId);
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.count)]));
};

// ---------- Install messages (setup embeds the bot keeps in channels) ----------

export const getInstallMessage = (guildId, key) =>
  db.prepare('SELECT * FROM install_messages WHERE guild_id = ? AND key = ?').get(guildId, key) ?? null;

export const listInstallMessages = (guildId) =>
  db.prepare('SELECT * FROM install_messages WHERE guild_id = ?').all(guildId);

export function setInstallMessage(guildId, key, channelId, messageId) {
  db.prepare(
    `INSERT INTO install_messages (guild_id, key, channel_id, message_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (guild_id, key) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id`,
  ).run(guildId, key, channelId, messageId);
}

export const deleteInstallMessage = (guildId, key) =>
  Number(db.prepare('DELETE FROM install_messages WHERE guild_id = ? AND key = ?').run(guildId, key).changes);
