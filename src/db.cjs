'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_SETTINGS = {
  alwaysOnTop: true,
  opacity: 1,
  glassMaterial: 'acrylic',
  glassTint: 0.34,
  themeStyle: 'green',
  customThemeColor: '#2f7658',
  launchAtLogin: false,
  shortcut: 'CommandOrControl+Shift+A',
  ocrMode: 'auto',
  ocrEndpoint: 'http://127.0.0.1:1224',
  ocrTimeoutMs: 25000,
  aiEnabled: false,
  aiProvider: 'openai',
  aiApiStyle: 'responses',
  aiBaseUrl: 'https://api.openai.com/v1',
  aiModel: 'gpt-5-mini',
  aiApiKey: '',
  windowBounds: null
};

function nowIso() {
  return new Date().toISOString();
}

class TodoDatabase {
  constructor(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        due_at TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        category TEXT NOT NULL DEFAULT '其他',
        notes TEXT NOT NULL DEFAULT '',
        attachment_path TEXT,
        ocr_text TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  listTasks() {
    return this.db.prepare(`
      SELECT * FROM tasks
      ORDER BY CASE WHEN status = 'completed' THEN 1 ELSE 0 END,
               CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
               due_at ASC,
               created_at DESC
    `).all();
  }

  createTask(input) {
    const timestamp = nowIso();
    const task = {
      id: randomUUID(),
      title: String(input.title || '新待办').trim().slice(0, 100),
      due_at: input.dueAt || input.due_at || null,
      priority: ['high', 'medium', 'low'].includes(input.priority) ? input.priority : 'medium',
      category: String(input.category || '其他').slice(0, 30),
      notes: String(input.notes || '').slice(0, 5000),
      attachment_path: input.attachmentPath || input.attachment_path || null,
      ocr_text: String(input.ocrText || input.ocr_text || '').slice(0, 20000),
      status: input.status === 'completed' ? 'completed' : 'active',
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: input.status === 'completed' ? timestamp : null
    };
    this.db.prepare(`
      INSERT INTO tasks (
        id, title, due_at, priority, category, notes, attachment_path,
        ocr_text, status, created_at, updated_at, completed_at
      ) VALUES (
        @id, @title, @due_at, @priority, @category, @notes, @attachment_path,
        @ocr_text, @status, @created_at, @updated_at, @completed_at
      )
    `).run(task);
    return this.getTask(task.id);
  }

  createTasks(inputs) {
    this.db.exec('BEGIN');
    try {
      const tasks = inputs.map((input) => this.createTask(input));
      this.db.exec('COMMIT');
      return tasks;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getTask(id) {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }

  updateTask(id, changes) {
    const current = this.getTask(id);
    if (!current) throw new Error('待办不存在或已删除');
    const next = {
      id,
      title: changes.title === undefined ? current.title : String(changes.title).trim().slice(0, 100),
      due_at: changes.dueAt === undefined && changes.due_at === undefined ? current.due_at : (changes.dueAt || changes.due_at || null),
      priority: changes.priority === undefined ? current.priority : changes.priority,
      category: changes.category === undefined ? current.category : String(changes.category).slice(0, 30),
      notes: changes.notes === undefined ? current.notes : String(changes.notes).slice(0, 5000),
      status: changes.status === undefined ? current.status : changes.status,
      updated_at: nowIso(),
      completed_at: current.completed_at
    };
    if (!['high', 'medium', 'low'].includes(next.priority)) next.priority = 'medium';
    if (!['active', 'completed'].includes(next.status)) next.status = 'active';
    if (current.status !== 'completed' && next.status === 'completed') next.completed_at = next.updated_at;
    if (current.status === 'completed' && next.status === 'active') next.completed_at = null;
    if (!next.title) next.title = '新待办';

    this.db.prepare(`
      UPDATE tasks SET
        title = @title, due_at = @due_at, priority = @priority,
        category = @category, notes = @notes, status = @status,
        updated_at = @updated_at, completed_at = @completed_at
      WHERE id = @id
    `).run(next);
    return this.getTask(id);
  }

  deleteTask(id) {
    return this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
  }

  getSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const stored = {};
    for (const row of rows) {
      try { stored[row.key] = JSON.parse(row.value); } catch { stored[row.key] = row.value; }
    }
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  setSettings(changes) {
    const statement = this.db.prepare(`
      INSERT INTO settings(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    this.db.exec('BEGIN');
    try {
      for (const [key, value] of Object.entries(changes)) {
        if (!(key in DEFAULT_SETTINGS)) continue;
        statement.run(key, JSON.stringify(value));
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getSettings();
  }

  close() {
    this.db.close();
  }
}

module.exports = { DEFAULT_SETTINGS, TodoDatabase };
