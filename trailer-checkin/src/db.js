import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trailers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  trailer_number TEXT NOT NULL,
  carrier        TEXT NOT NULL,
  driver_name    TEXT NOT NULL DEFAULT '',
  driver_phone   TEXT NOT NULL DEFAULT '',
  load_type      TEXT NOT NULL DEFAULT 'live',
  seal_number    TEXT NOT NULL DEFAULT '',
  seal_intact    INTEGER NOT NULL DEFAULT 1,
  bol_number     TEXT NOT NULL DEFAULT '',
  po_numbers     TEXT NOT NULL DEFAULT '',
  door           TEXT NOT NULL DEFAULT '',
  pallet_count   INTEGER,
  temperature_f  REAL,
  condition      TEXT NOT NULL DEFAULT 'ok',
  status         TEXT NOT NULL DEFAULT 'arrived',
  arrived_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trailers_status ON trailers(status);
CREATE INDEX IF NOT EXISTS idx_trailers_arrived ON trailers(arrived_at);
CREATE TABLE IF NOT EXISTS trailer_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trailer_id INTEGER NOT NULL REFERENCES trailers(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'note',
  body       TEXT NOT NULL,
  author     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_trailer ON trailer_notes(trailer_id);
`;

const FIELDS = [
  'trailer_number', 'carrier', 'driver_name', 'driver_phone', 'load_type', 'seal_number',
  'seal_intact', 'bol_number', 'po_numbers', 'door', 'pallet_count', 'temperature_f',
  'condition', 'status', 'arrived_at',
];

export function openDb(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

const toTrailer = (row) => row && { ...row, seal_intact: !!row.seal_intact };

export function createStore(db) {
  const now = () => new Date().toISOString();

  function addNote(trailerId, { kind = 'note', body, author = '' }) {
    const r = db.prepare(
      'INSERT INTO trailer_notes (trailer_id, kind, body, author, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(trailerId, kind, body, author, now());
    return Number(r.lastInsertRowid);
  }

  return {
    listTrailers({ status, q, limit = 200 } = {}) {
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (q) {
        const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
        where.push(`(trailer_number LIKE ? ESCAPE '\\' OR carrier LIKE ? ESCAPE '\\' OR bol_number LIKE ? ESCAPE '\\'
          OR po_numbers LIKE ? ESCAPE '\\' OR driver_name LIKE ? ESCAPE '\\')`);
        params.push(like, like, like, like, like);
      }
      const sql = `SELECT * FROM trailers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY arrived_at DESC, id DESC LIMIT ?`;
      return db.prepare(sql).all(...params, limit).map(toTrailer);
    },

    getTrailer(id) {
      const t = toTrailer(db.prepare('SELECT * FROM trailers WHERE id = ?').get(id));
      if (!t) return null;
      t.notes = db.prepare('SELECT * FROM trailer_notes WHERE trailer_id = ? ORDER BY id ASC').all(id);
      return t;
    },

    createTrailer(value, author = '') {
      const ts = now();
      const cols = [...FIELDS, 'created_at', 'updated_at'];
      const vals = [...FIELDS.map((f) => value[f] ?? null), ts, ts];
      const r = db.prepare(
        `INSERT INTO trailers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      ).run(...vals);
      const id = Number(r.lastInsertRowid);
      addNote(id, { kind: 'status', body: `Trailer arrived (${value.status})`, author });
      return this.getTrailer(id);
    },

    updateTrailer(id, patch, author = '') {
      const existing = db.prepare('SELECT * FROM trailers WHERE id = ?').get(id);
      if (!existing) return null;
      const keys = Object.keys(patch).filter((k) => FIELDS.includes(k));
      if (keys.length) {
        db.prepare(`UPDATE trailers SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
          .run(...keys.map((k) => patch[k]), now(), id);
      }
      if (patch.status && patch.status !== existing.status) {
        addNote(id, { kind: 'status', body: `Status: ${existing.status} → ${patch.status}`, author });
      }
      return this.getTrailer(id);
    },

    addNote(id, { body, author }) {
      const t = db.prepare('SELECT id FROM trailers WHERE id = ?').get(id);
      if (!t) return null;
      addNote(id, { kind: 'note', body, author });
      db.prepare('UPDATE trailers SET updated_at = ? WHERE id = ?').run(now(), id);
      return this.getTrailer(id);
    },

    deleteTrailer(id) {
      return db.prepare('DELETE FROM trailers WHERE id = ?').run(id).changes > 0;
    },
  };
}
