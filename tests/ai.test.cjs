'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { joinUrl, validateTasks } = require('../src/services/ai.cjs');

test('正确拼接 OpenAI 兼容接口地址', () => {
  assert.equal(joinUrl('https://api.openai.com/v1/', '/responses'), 'https://api.openai.com/v1/responses');
  assert.equal(joinUrl('https://api.deepseek.com', '/chat/completions'), 'https://api.deepseek.com/chat/completions');
  assert.equal(joinUrl('https://example.com/v1/chat/completions', '/chat/completions'), 'https://example.com/v1/chat/completions');
});

test('校验 AI 任务并对非法枚举使用本地兜底', () => {
  const tasks = validateTasks({ tasks: [{
    title: '发送合同', dueAt: '2026-08-26T15:00', priority: 'urgent', category: '不存在', notes: ''
  }] }, '明天下午三点发送合同', new Date(2026, 7, 25, 10, 0));
  assert.equal(tasks[0].title, '发送合同');
  assert.equal(tasks[0].priority, 'medium');
  assert.equal(tasks[0].category, '工作');
  assert.equal(tasks[0].source, 'ai');
});
