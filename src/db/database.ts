import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })

export const db = new Database(config.dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id   INTEGER PRIMARY KEY,
  username      TEXT,
  first_name    TEXT,
  language      TEXT    NOT NULL DEFAULT 'fa',
  model         TEXT    NOT NULL DEFAULT '',
  persona       TEXT    NOT NULL DEFAULT 'default',
  temperature   REAL    NOT NULL DEFAULT -1,
  is_banned     INTEGER NOT NULL DEFAULT 0,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  msg_count     INTEGER NOT NULL DEFAULT 0,
  image_count   INTEGER NOT NULL DEFAULT 0,
  voice_count   INTEGER NOT NULL DEFAULT 0,
  search_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  role       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  sent       INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  content     TEXT    NOT NULL,
  vector      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(telegram_id, id DESC);
`)

// ادمین‌های تعریف‌شده در .env همیشه ادمین هستند
const promoteAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE telegram_id = ?')
for (const id of config.adminIds) promoteAdmin.run(id)

// ---------- مهاجرت سبک: ستون‌های جدید را اضافه کن ----------
const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
const hasCol = (n: string): boolean => userCols.some((c) => c.name === n)
if (!hasCol('voice')) {
  db.exec("ALTER TABLE users ADD COLUMN voice TEXT NOT NULL DEFAULT 'Kore'")
  console.log('🗄  ستون voice اضافه شد')
}
if (!hasCol('tone')) {
  db.exec("ALTER TABLE users ADD COLUMN tone TEXT NOT NULL DEFAULT 'normal'")
  console.log('🗄  ستون tone اضافه شد')
}

export interface MemoryRow {
  id: number
  telegram_id: number
  content: string
  vector: string | null
  created_at: string
}

export interface UserRow {
  telegram_id: number
  username: string | null
  first_name: string | null
  language: string
  model: string
  persona: string
  temperature: number
  voice: string
  tone: string
  is_banned: number
  is_admin: number
  msg_count: number
  image_count: number
  voice_count: number
  search_count: number
  created_at: string
  last_seen: string
}

const stmts = {
  getUser: db.prepare<[number], UserRow>('SELECT * FROM users WHERE telegram_id = ?'),
  insertUser: db.prepare<[number, string | null, string | null]>(
    `INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name`,
  ),
  touch: db.prepare('UPDATE users SET last_seen = datetime(\'now\') WHERE telegram_id = ?'),
  setModel: db.prepare('UPDATE users SET model = ? WHERE telegram_id = ?'),
  setPersona: db.prepare('UPDATE users SET persona = ? WHERE telegram_id = ?'),
  setTemperature: db.prepare('UPDATE users SET temperature = ? WHERE telegram_id = ?'),
  setVoice: db.prepare('UPDATE users SET voice = ? WHERE telegram_id = ?'),
  setTone: db.prepare('UPDATE users SET tone = ? WHERE telegram_id = ?'),
  setBanned: db.prepare('UPDATE users SET is_banned = ? WHERE telegram_id = ?'),
  addMemory: db.prepare<[number, string, string | null]>('INSERT INTO memories (telegram_id, content, vector) VALUES (?, ?, ?)'),
  recentMemories: db.prepare<[number, number], MemoryRow>('SELECT * FROM memories WHERE telegram_id = ? ORDER BY id DESC LIMIT ?'),
  allMemories: db.prepare<[number], MemoryRow>('SELECT * FROM memories WHERE telegram_id = ? ORDER BY id DESC'),
  clearMemories: db.prepare('DELETE FROM memories WHERE telegram_id = ?'),
  countMemories: db.prepare('SELECT COUNT(*) AS n FROM memories WHERE telegram_id = ?'),
  incMsg: db.prepare('UPDATE users SET msg_count = msg_count + 1 WHERE telegram_id = ?'),
  incImage: db.prepare('UPDATE users SET image_count = image_count + 1 WHERE telegram_id = ?'),
  incVoice: db.prepare('UPDATE users SET voice_count = voice_count + 1 WHERE telegram_id = ?'),
  incSearch: db.prepare('UPDATE users SET search_count = search_count + 1 WHERE telegram_id = ?'),
  addMessage: db.prepare<[number, string, string]>(
    'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)',
  ),
  clearHistory: db.prepare('DELETE FROM messages WHERE user_id = ?'),
  getHistory: db.prepare<[number, number], { role: string; content: string }>(
    'SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?',
  ),
  resetSettings: db.prepare(
    "UPDATE users SET persona = 'default', temperature = -1, model = '', voice = 'Kore', tone = 'normal' WHERE telegram_id = ?",
  ),
  allUsers: db.prepare<[], UserRow>('SELECT * FROM users ORDER BY last_seen DESC'),
  countUsers: db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM users'),
  countMessages: db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM messages'),
  activeToday: db.prepare<[], { n: number }>(
    "SELECT COUNT(*) AS n FROM users WHERE date(last_seen) = date('now')",
  ),
  totals: db.prepare<
    [],
    { msg: number; image: number; voice: number; search: number }
  >(
    `SELECT SUM(msg_count) AS msg, SUM(image_count) AS image,
            SUM(voice_count) AS voice, SUM(search_count) AS search FROM users`,
  ),
}

export function upsertUser(telegramId: number, username?: string, firstName?: string): UserRow {
  stmts.insertUser.run(telegramId, username ?? null, firstName ?? null)
  const row = stmts.getUser.get(telegramId)
  if (!row) throw new Error(`کاربر ${telegramId} بعد از درج یافت نشد`)
  return row
}

export function getUser(telegramId: number): UserRow | undefined {
  return stmts.getUser.get(telegramId)
}

export const userStore = {
  touch: (id: number) => stmts.touch.run(id),
  setModel: (id: number, model: string) => stmts.setModel.run(model, id),
  setPersona: (id: number, persona: string) => stmts.setPersona.run(persona, id),
  setTemperature: (id: number, temp: number) => stmts.setTemperature.run(temp, id),
  setVoice: (id: number, voice: string) => stmts.setVoice.run(voice, id),
  setTone: (id: number, tone: string) => stmts.setTone.run(tone, id),
  setBanned: (id: number, banned: boolean) => stmts.setBanned.run(banned ? 1 : 0, id),
  reset: (id: number) => stmts.resetSettings.run(id),
  inc: {
    msg: (id: number) => stmts.incMsg.run(id),
    image: (id: number) => stmts.incImage.run(id),
    voice: (id: number) => stmts.incVoice.run(id),
    search: (id: number) => stmts.incSearch.run(id),
  },
}

export const memoryStore = {
  /** یک خاطره ذخیره می‌کند */
  add: (id: number, content: string, vector?: string) => stmts.addMemory.run(id, content, vector ?? null),
  /** آخرین خاطرات کاربر */
  recent: (id: number, limit = 20) => stmts.recentMemories.all(id, limit),
  /** همهٔ خاطرات یک کاربر */
  all: (id: number) => stmts.allMemories.all(id),
  /** پاک کردن خاطرات یک کاربر */
  clear: (id: number) => stmts.clearMemories.run(id),
  /** تعداد خاطرات */
  count: (id: number) => (stmts.countMemories.get(id) as { n: number }).n,
}

export const historyStore = {
  add: (userId: number, role: 'user' | 'assistant', content: string) =>
    stmts.addMessage.run(userId, role, content),
  /** آخرین N پیام به ترتیب زمانی صعودی */
  recent: (userId: number, limit: number) => stmts.getHistory.all(userId, limit).reverse(),
  clear: (userId: number) => stmts.clearHistory.run(userId),
}

export const statsStore = {
  totalUsers: () => stmts.countUsers.get()!.n,
  totalMessages: () => stmts.countMessages.get()!.n,
  activeToday: () => stmts.activeToday.get()!.n,
  totals: () => stmts.totals.get() ?? { msg: 0, image: 0, voice: 0, search: 0 },
  allUsers: () => stmts.allUsers.all(),
}

export const settingStore = {
  get: (key: string): string | undefined =>
    db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)?.value,
  set: (key: string, value: string) =>
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),
}

export function logBroadcast(adminId: number, content: string, sent: number, failed: number): void {
  db.prepare('INSERT INTO broadcasts (admin_id, content, sent, failed) VALUES (?, ?, ?, ?)').run(
    adminId,
    content,
    sent,
    failed,
  )
}
