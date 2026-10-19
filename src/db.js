// Lớp truy cập SQLite (dùng module node:sqlite có sẵn của Node.js, không cần cài native module).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const dbFile = path.resolve(config.dbPath);
mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id        TEXT PRIMARY KEY,
  log_channel_id  TEXT,
  mute_role_id    TEXT,
  mod_role_id     TEXT,
  warn_threshold  INTEGER NOT NULL DEFAULT 0,
  warn_mute_ms    INTEGER NOT NULL DEFAULT 3600000,
  updated_at      INTEGER
);

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
  active        INTEGER NOT NULL DEFAULT 1,
  hidden        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  UNIQUE (guild_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_cases_user   ON cases (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cases_active ON cases (guild_id, active, type);
CREATE INDEX IF NOT EXISTS idx_cases_temp   ON cases (active, expires_at);
`);

const DEFAULT_CONFIG = {
  log_channel_id: null,
  mute_role_id: null,
  mod_role_id: null,
  warn_threshold: 0,
  warn_mute_ms: 3600000,
};

// ---------- Guild config ----------

export function getGuildConfig(guildId) {
  const row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  return row ? { ...DEFAULT_CONFIG, ...row } : { guild_id: guildId, ...DEFAULT_CONFIG };
}

export function updateGuildConfig(guildId, patch = {}) {
  db.prepare('INSERT OR IGNORE INTO guild_config (guild_id, updated_at) VALUES (?, ?)').run(
    guildId,
    Date.now(),
  );
  const cols = Object.keys(patch);
  if (cols.length) {
    const sql = `UPDATE guild_config SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE guild_id = ?`;
    db.prepare(sql).run(...cols.map((c) => patch[c]), Date.now(), guildId);
  }
  return getGuildConfig(guildId);
}

// ---------- Cases ----------

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
    const expiresAt = durationMs ? createdAt + durationMs : null;
    const info = db
      .prepare(
        `INSERT INTO cases
          (guild_id, case_number, user_id, moderator_id, type, reason, duration_ms, expires_at, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(guildId, n, userId, moderatorId, type, reason, durationMs, expiresAt, createdAt, createdAt);
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
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM cases WHERE ${whereSql}`)
    .get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM cases WHERE ${whereSql} ORDER BY case_number DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { rows, total };
}

export const countActiveByType = (guildId, userId, type) =>
  db
    .prepare(
      'SELECT COUNT(*) AS n FROM cases WHERE guild_id = ? AND user_id = ? AND type = ? AND active = 1 AND hidden = 0',
    )
    .get(guildId, userId, type).n;

export function getActiveCases(guildId, userId, type = null) {
  const base = 'SELECT * FROM cases WHERE guild_id = ? AND user_id = ? AND active = 1 AND hidden = 0';
  return type
    ? db.prepare(`${base} AND type = ? ORDER BY id DESC`).all(guildId, userId, type)
    : db.prepare(`${base} ORDER BY id DESC`).all(guildId, userId);
}

export const getActiveTempCases = () =>
  db
    .prepare(
      "SELECT * FROM cases WHERE active = 1 AND hidden = 0 AND expires_at IS NOT NULL AND type IN ('mute', 'ban')",
    )
    .all();

export const deactivateCase = (id) =>
  Number(db.prepare('UPDATE cases SET active = 0, updated_at = ? WHERE id = ?').run(Date.now(), id).changes);

export const deactivateCases = (guildId, userId, type) =>
  Number(
    db
      .prepare(
        'UPDATE cases SET active = 0, updated_at = ? WHERE guild_id = ? AND user_id = ? AND type = ? AND active = 1',
      )
      .run(Date.now(), guildId, userId, type).changes,
  );

export const hideCase = (id) =>
  Number(db.prepare('UPDATE cases SET hidden = 1, updated_at = ? WHERE id = ?').run(Date.now(), id).changes);

// ---------- Offence ----------

export const offenceBreakdown = (guildId, userId) =>
  db
    .prepare(
      `SELECT type, COUNT(*) AS count, MAX(created_at) AS last_at
       FROM cases
       WHERE guild_id = ? AND user_id = ? AND hidden = 0 AND type IN ('warn','mute','kick','ban')
       GROUP BY type`,
    )
    .all(guildId, userId);

export const topOffenders = (guildId, limit = 10) =>
  db
    .prepare(
      `SELECT user_id, COUNT(*) AS count
       FROM cases
       WHERE guild_id = ? AND hidden = 0 AND type IN ('warn','mute','kick','ban')
       GROUP BY user_id
       ORDER BY count DESC, user_id ASC
       LIMIT ?`,
    )
    .all(guildId, limit);
