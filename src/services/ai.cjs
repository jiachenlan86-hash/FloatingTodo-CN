'use strict';

const { structureWithRules } = require('./rules.cjs');

const CATEGORIES = ['工作', '生活', '学习', '其他', '等待他人'];
const PRIORITIES = ['high', 'medium', 'low'];

const TASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          dueAt: { type: ['string', 'null'] },
          priority: { type: 'string', enum: PRIORITIES },
          category: { type: 'string', enum: CATEGORIES },
          notes: { type: 'string' }
        },
        required: ['title', 'dueAt', 'priority', 'category', 'notes']
      }
    }
  },
  required: ['tasks']
};

function joinUrl(baseUrl, endpoint) {
  const base = String(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (base.endsWith(endpoint)) return base;
  return `${base}${endpoint}`;
}

function promptFor(text, now) {
  return [
    `当前本地时间：${now.toISOString()}`,
    '请把下面的中文 OCR 文本整理成一个或多个明确、可执行的待办。',
    '不要臆造没有出现的日期、负责人或事实。相对日期要换算为本地 ISO 时间（YYYY-MM-DDTHH:mm），无法确定则为 null。',
    '标题要简短、以动作开头；原文的重要上下文放在备注。',
    '',
    text
  ].join('\n');
}

async function requestResponses(text, settings, apiKey, now) {
  const response = await fetch(joinUrl(settings.aiBaseUrl, '/responses'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: settings.aiModel || 'gpt-5-mini',
      store: false,
      instructions: '你是中文待办整理助手。只按给定 JSON Schema 输出。',
      input: promptFor(text, now),
      text: {
        format: {
          type: 'json_schema',
          name: 'todo_items',
          strict: true,
          schema: TASK_SCHEMA
        }
      }
    })
  });
  if (!response.ok) throw new Error(`AI 接口返回 ${response.status}：${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  if (!outputText) throw new Error('AI 接口没有返回可用文本');
  return JSON.parse(outputText);
}

async function requestChatCompletions(text, settings, apiKey, now) {
  const response = await fetch(joinUrl(settings.aiBaseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: settings.aiModel || 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `你是中文待办整理助手。输出 JSON 对象，顶层为 tasks 数组。每项必须含 title、dueAt、priority(high/medium/low)、category(${CATEGORIES.join('/')})、notes。` },
        { role: 'user', content: promptFor(text, now) }
      ]
    })
  });
  if (!response.ok) throw new Error(`AI 接口返回 ${response.status}：${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const outputText = data.choices?.[0]?.message?.content;
  if (!outputText) throw new Error('AI 接口没有返回可用文本');
  return JSON.parse(outputText.replace(/^```json\s*|\s*```$/g, ''));
}

function validateTasks(data, fallbackText, now) {
  if (!data || !Array.isArray(data.tasks) || !data.tasks.length) throw new Error('AI 返回的待办结构无效');
  return data.tasks.slice(0, 8).map((task, index) => {
    const fallback = structureWithRules(fallbackText, now)[index] || structureWithRules(fallbackText, now)[0];
    return {
      title: String(task.title || fallback.title).trim().slice(0, 100),
      dueAt: task.dueAt && !Number.isNaN(new Date(task.dueAt).getTime()) ? String(task.dueAt).slice(0, 16) : null,
      priority: PRIORITIES.includes(task.priority) ? task.priority : fallback.priority,
      category: CATEGORIES.includes(task.category) ? task.category : fallback.category,
      notes: String(task.notes || '').trim().slice(0, 2000),
      source: 'ai'
    };
  });
}

async function structureText(text, settings, apiKey, now = new Date()) {
  const localTasks = structureWithRules(text, now);
  if (!settings.aiEnabled || !apiKey || !text.trim()) {
    return { tasks: localTasks, mode: 'rules', warning: '' };
  }

  try {
    const data = settings.aiApiStyle === 'chat_completions'
      ? await requestChatCompletions(text, settings, apiKey, now)
      : await requestResponses(text, settings, apiKey, now);
    return { tasks: validateTasks(data, text, now), mode: 'ai', warning: '' };
  } catch (error) {
    return { tasks: localTasks, mode: 'rules', warning: `AI 整理失败，已改用本地规则：${error.message}` };
  }
}

async function testAi(settings, apiKey) {
  if (!apiKey) return { ok: false, message: '请先填写 API Key' };
  const result = await structureText('明天下午三点发送测试报价', { ...settings, aiEnabled: true }, apiKey, new Date());
  if (result.mode !== 'ai') return { ok: false, message: result.warning || 'AI 测试失败' };
  return { ok: true, message: 'AI 接口连接正常' };
}

module.exports = {
  TASK_SCHEMA,
  joinUrl,
  structureText,
  testAi,
  validateTasks
};
