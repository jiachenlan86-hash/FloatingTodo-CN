'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEndpoint, normalizeOcrText } = require('../src/services/ocr.cjs');

test('清理 Windows OCR 在中文字符之间插入的空格', () => {
  assert.equal(normalizeOcrText('明 天 下 午 三 点 发 送 报 价'), '明天下午三点发送报价');
  assert.equal(normalizeOcrText('订单 A 123\n 客户确认'), '订单 A 123\n客户确认');
});

test('规范 Umi-OCR 地址', () => {
  assert.equal(normalizeEndpoint('http://127.0.0.1:1224///'), 'http://127.0.0.1:1224');
});
