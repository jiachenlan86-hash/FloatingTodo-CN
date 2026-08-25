'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TodoDatabase } = require('../src/db.cjs');

test('SQLite 可创建、更新、完成和删除待办', (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'floating-todo-test-'));
  const db = new TodoDatabase(path.join(folder, 'todo.sqlite'));
  t.after(() => {
    db.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  const created = db.createTask({ title: '发送报价', priority: 'high', category: '工作' });
  assert.equal(db.listTasks().length, 1);
  const updated = db.updateTask(created.id, { status: 'completed', notes: '已发微信' });
  assert.equal(updated.status, 'completed');
  assert.ok(updated.completed_at);
  assert.equal(updated.notes, '已发微信');
  assert.equal(db.deleteTask(created.id), true);
  assert.equal(db.listTasks().length, 0);
});

test('设置有默认值且可持久化', (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'floating-todo-settings-'));
  const db = new TodoDatabase(path.join(folder, 'todo.sqlite'));
  t.after(() => {
    db.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });
  assert.equal(db.getSettings().ocrMode, 'auto');
  assert.equal(db.getSettings().glassMaterial, 'acrylic');
  assert.equal(db.getSettings().glassTint, 0.34);
  assert.equal(db.getSettings().themeStyle, 'green');
  assert.equal(db.getSettings().customThemeColor, '#2f7658');
  db.setSettings({ glassTint: 0.28, themeStyle: 'custom', customThemeColor: '#7a5fa3', aiProvider: 'deepseek', shortcut: 'Alt+Shift+A', unknown: 'ignored' });
  assert.equal(db.getSettings().glassTint, 0.28);
  assert.equal(db.getSettings().themeStyle, 'custom');
  assert.equal(db.getSettings().customThemeColor, '#7a5fa3');
  assert.equal(db.getSettings().aiProvider, 'deepseek');
  assert.equal(db.getSettings().shortcut, 'Alt+Shift+A');
  assert.equal(db.getSettings().unknown, undefined);
});
