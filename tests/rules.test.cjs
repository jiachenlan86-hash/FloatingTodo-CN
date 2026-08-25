'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanTitle,
  inferCategory,
  parseDueAt,
  sectionForTask,
  structureWithRules
} = require('../src/services/rules.cjs');

const NOW = new Date(2026, 7, 25, 10, 0, 0);

test('解析中文相对日期和下午时间', () => {
  assert.equal(parseDueAt('明天下午3点发报价', NOW), '2026-08-26T15:00');
  assert.equal(parseDueAt('今天下班前给客户回消息', NOW), '2026-08-25T18:00');
  assert.equal(parseDueAt('后天上午十点开会', NOW), '2026-08-27T10:00');
  assert.equal(parseDueAt('明天下午三点发报价', NOW), '2026-08-26T15:00');
  assert.equal(parseDueAt('明晚八点半确认', NOW), '2026-08-26T20:30');
});

test('解析月日和星期', () => {
  assert.equal(parseDueAt('8月30日交付', NOW), '2026-08-30T18:00');
  assert.equal(parseDueAt('周五下午2点提交', NOW), '2026-08-28T14:00');
});

test('从一段中文工作消息拆成多条待办', () => {
  const tasks = structureWithRules('张总：门板颜色改成奶油白；另外拉手改黑色；今天下午重新发报价', NOW);
  assert.equal(tasks.length, 3);
  assert.match(tasks[0].title, /门板颜色/);
  assert.equal(tasks[2].dueAt, '2026-08-25T17:00');
  assert.equal(tasks[2].priority, 'high');
});

test('识别等待他人分类并清理说话人', () => {
  assert.equal(inferCategory('等待客户确认报价'), '等待他人');
  assert.equal(cleanTitle('客户：请你明天发合同。'), '明天发合同');
});

test('任务进入今天、本周、以后、等待和完成分区', () => {
  assert.equal(sectionForTask({ status: 'active', category: '工作', due_at: '2026-08-25T18:00' }, NOW), 'today');
  assert.equal(sectionForTask({ status: 'active', category: '工作', due_at: '2026-08-28T18:00' }, NOW), 'week');
  assert.equal(sectionForTask({ status: 'active', category: '工作', due_at: null }, NOW), 'later');
  assert.equal(sectionForTask({ status: 'active', category: '等待他人', due_at: null }, NOW), 'waiting');
  assert.equal(sectionForTask({ status: 'completed', category: '工作', due_at: null }, NOW), 'completed');
});
