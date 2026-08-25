'use strict';

const api = window.floatingTodo;
const state = {
  tasks: [],
  section: 'today',
  settings: null,
  review: null,
  toastTimer: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const AI_PRESETS = {
  deepseek: {
    apiStyle: 'chat_completions',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  openai: {
    apiStyle: 'responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5-mini',
    keyUrl: 'https://platform.openai.com/api-keys'
  }
};

const THEME_PRESETS = {
  green: {
    accent: '#2f7658',
    strong: '#21563f',
    soft: 'rgb(47 118 88 / .14)',
    brandStart: '#3d8968',
    brandEnd: '#245c45',
    captureStart: '#397f61',
    captureEnd: '#245b43'
  },
  gray: {
    accent: '#5c6168',
    strong: '#282b2f',
    soft: 'rgb(92 97 104 / .13)',
    brandStart: '#5c6067',
    brandEnd: '#313439',
    captureStart: '#505359',
    captureEnd: '#2a2c30'
  }
};

function normalizeHex(value, fallback = '#2f7658') {
  const normalized = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function hexToRgb(value) {
  const hex = normalizeHex(value).slice(1);
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

function mixHex(first, second, secondWeight) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const weight = Math.max(0, Math.min(1, secondWeight));
  return `#${a.map((channel, index) => Math.round(channel * (1 - weight) + b[index] * weight).toString(16).padStart(2, '0')).join('')}`;
}

function themeForSettings(settings = {}) {
  const style = ['green', 'gray', 'custom'].includes(settings.themeStyle) ? settings.themeStyle : 'green';
  if (style !== 'custom') return { style, ...THEME_PRESETS[style] };
  const accent = normalizeHex(settings.customThemeColor);
  const rgb = hexToRgb(accent);
  return {
    style,
    accent,
    strong: mixHex(accent, '#111512', .43),
    soft: `rgb(${rgb.join(' ')} / .14)`,
    brandStart: mixHex(accent, '#ffffff', .13),
    brandEnd: mixHex(accent, '#111512', .27),
    captureStart: mixHex(accent, '#ffffff', .08),
    captureEnd: mixHex(accent, '#101411', .31)
  };
}

function applyTheme(settings = {}) {
  const theme = themeForSettings(settings);
  const rgb = hexToRgb(theme.accent);
  const root = document.documentElement;
  root.dataset.theme = theme.style;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-strong', theme.strong);
  root.style.setProperty('--accent-soft', theme.soft);
  root.style.setProperty('--accent-rgb', rgb.join(' '));
  root.style.setProperty('--brand-start', theme.brandStart);
  root.style.setProperty('--brand-end', theme.brandEnd);
  root.style.setProperty('--capture-start', theme.captureStart);
  root.style.setProperty('--capture-end', theme.captureEnd);
}

function applyAppearance(settings = {}) {
  const tint = Math.max(0.12, Math.min(0.82, Number(settings.glassTint) || 0.34));
  const material = ['acrylic', 'mica', 'none'].includes(settings.glassMaterial) ? settings.glassMaterial : 'acrylic';
  document.documentElement.style.setProperty('--glass-tint', tint.toFixed(2));
  document.documentElement.style.setProperty('--shell-alpha', (0.03 + tint * 0.72).toFixed(2));
  document.documentElement.style.setProperty('--card-alpha', (0.16 + tint * 0.62).toFixed(2));
  document.documentElement.style.setProperty('--control-alpha', (0.20 + tint * 0.58).toFixed(2));
  document.documentElement.style.setProperty('--modal-alpha', (0.80 + tint * 0.18).toFixed(2));
  document.documentElement.dataset.glassMaterial = material;
}

function applyAiPreset(provider, force = false) {
  const preset = AI_PRESETS[provider];
  if (!preset) return;
  if (force || !$('#aiBaseUrl').value.trim()) $('#aiBaseUrl').value = preset.baseUrl;
  if (force || !$('#aiModel').value.trim()) $('#aiModel').value = preset.model;
  if (force || !$('#aiApiStyle').value) $('#aiApiStyle').value = preset.apiStyle;
  if (force) $('#aiApiStyle').value = preset.apiStyle;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (id === 'settingsModal' && state.settings) {
    applyAppearance(state.settings);
    applyTheme(state.settings);
  }
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sectionForTask(task) {
  if (task.status === 'completed') return 'completed';
  if (task.category === '等待他人') return 'waiting';
  if (!task.due_at) return 'later';
  const due = new Date(task.due_at);
  const now = new Date();
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
  if (due <= endToday) return 'today';
  const endWeek = new Date(endToday); endWeek.setDate(endWeek.getDate() + ((7 - endWeek.getDay()) % 7));
  return due <= endWeek ? 'week' : 'later';
}

function dueLabel(value) {
  if (!value) return '';
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return '';
  const today = localDateKey();
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const day = localDateKey(due);
  const time = due.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (day === today) return `今天 ${time}`;
  if (day === localDateKey(tomorrowDate)) return `明天 ${time}`;
  return due.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }) + ` ${time}`;
}

function renderTasks() {
  const groups = { today: [], week: [], later: [], waiting: [], completed: [] };
  state.tasks.forEach((task) => groups[sectionForTask(task)].push(task));
  $$('#tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === state.section);
    button.querySelector('span').textContent = groups[button.dataset.section].length;
  });
  $('#pendingCount').textContent = state.tasks.filter((task) => task.status !== 'completed').length;

  const tasks = groups[state.section];
  if (!tasks.length) {
    const copy = {
      today: ['今天很清爽', '从截图或输入框添加一件事'],
      week: ['本周暂无安排', '给未来留一点从容'],
      later: ['以后再做的事为空', '没有日期的待办会出现在这里'],
      waiting: ['没有等待中的事项', '“等待回复”会自动归到这里'],
      completed: ['还没有已完成事项', '完成一件事后会留在这里']
    }[state.section];
    $('#taskList').innerHTML = `<div class="empty-state"><span class="empty-icon">✓</span><strong>${copy[0]}</strong><small>${copy[1]}</small></div>`;
    return;
  }

  $('#taskList').innerHTML = tasks.map((task) => {
    const completed = task.status === 'completed';
    const due = dueLabel(task.due_at);
    const dueClass = task.due_at?.slice(0, 10) === localDateKey() ? 'today' : 'soon';
    return `<article class="task-card priority-${escapeHtml(task.priority)} ${completed ? 'completed' : ''}" data-id="${escapeHtml(task.id)}">
      <button class="check-btn" data-action="toggle" title="${completed ? '恢复' : '完成'}"></button>
      <div class="task-main">
        <p class="task-title">${escapeHtml(task.title)}</p>
        <div class="task-meta">
          <span class="pill">${escapeHtml(task.category)}</span>
          ${due ? `<span class="pill due ${dueClass}">${escapeHtml(due)}</span>` : '<span class="pill">未设日期</span>'}
          ${task.priority === 'high' ? '<span>高优先级</span>' : ''}
        </div>
      </div>
      <div class="task-tools">
        ${task.attachment_path ? '<button class="attachment-btn" data-action="attachment" title="查看原截图">▧</button>' : ''}
        <button class="edit-btn" data-action="edit" title="编辑">•••</button>
      </div>
    </article>`;
  }).join('');
}

async function reloadTasks() {
  state.tasks = await api.tasks.list();
  renderTasks();
}

async function addQuickTask() {
  const input = $('#quickInput');
  const text = input.value.trim();
  if (!text) return;
  $('#quickAddBtn').disabled = true;
  try {
    const structured = await api.capture.restructure(text);
    await api.tasks.create(structured.tasks.map((task) => ({ ...task, ocrText: text })));
    input.value = '';
    await reloadTasks();
    toast(structured.tasks.length > 1 ? `已添加 ${structured.tasks.length} 条待办` : '已添加待办');
  } catch (error) {
    toast(`添加失败：${error.message}`);
  } finally {
    $('#quickAddBtn').disabled = false;
  }
}

function openEditor(task) {
  $('#editId').value = task.id;
  $('#editTitle').value = task.title;
  $('#editDueAt').value = task.due_at ? task.due_at.slice(0, 16) : '';
  $('#editPriority').value = task.priority;
  $('#editCategory').value = task.category;
  $('#editNotes').value = task.notes || '';
  openModal('editModal');
}

function emptyReviewTask() {
  return { title: '', dueAt: null, priority: 'medium', category: '其他', notes: '' };
}

function renderReviewTasks() {
  const container = $('#reviewTasks');
  container.innerHTML = state.review.tasks.map((task, index) => `<section class="review-item" data-index="${index}">
    <div class="review-item-top">
      <input class="review-title" maxlength="100" value="${escapeHtml(task.title)}" placeholder="待办标题">
      <button type="button" class="remove-review" title="移除">×</button>
    </div>
    <div class="review-fields">
      <input class="review-due" type="datetime-local" value="${escapeHtml(task.dueAt ? task.dueAt.slice(0, 16) : '')}">
      <select class="review-priority">
        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>高</option>
        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>中</option>
        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>低</option>
      </select>
      <select class="review-category">${['工作','生活','学习','其他','等待他人'].map((item) => `<option ${task.category === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
    </div>
    <textarea class="review-notes" rows="2" placeholder="备注（可选）">${escapeHtml(task.notes || '')}</textarea>
  </section>`).join('');
}

function collectReviewTasks() {
  return $$('.review-item').map((item) => ({
    title: item.querySelector('.review-title').value.trim(),
    dueAt: item.querySelector('.review-due').value || null,
    priority: item.querySelector('.review-priority').value,
    category: item.querySelector('.review-category').value,
    notes: item.querySelector('.review-notes').value.trim()
  })).filter((task) => task.title);
}

function beginReview(payload) {
  state.review = { tasks: [], attachmentPath: '', ocrText: '', previewDataUrl: payload?.previewDataUrl || '' };
  if (payload?.previewDataUrl) $('#capturePreview').src = payload.previewDataUrl;
  $('#reviewLoading').classList.remove('hidden');
  $('#reviewContent').classList.add('hidden');
  openModal('reviewModal');
}

function showReviewResult(payload) {
  if (!state.review) beginReview(payload);
  $('#reviewLoading').classList.add('hidden');
  $('#reviewContent').classList.remove('hidden');
  if (payload.previewDataUrl) $('#capturePreview').src = payload.previewDataUrl;
  state.review = {
    tasks: payload.tasks?.length ? payload.tasks : [emptyReviewTask()],
    attachmentPath: payload.attachmentPath || '',
    ocrText: payload.ocrText || '',
    previewDataUrl: payload.previewDataUrl || state.review.previewDataUrl
  };
  $('#ocrText').value = state.review.ocrText;
  $('#ocrEngine').textContent = payload.engine || '手动输入';
  const warning = payload.warning || payload.error || '';
  $('#reviewWarning').textContent = warning;
  $('#reviewWarning').classList.toggle('hidden', !warning);
  renderReviewTasks();
}

async function saveReview() {
  const tasks = collectReviewTasks();
  if (!tasks.length) { toast('请至少填写一条待办标题'); return; }
  $('#saveReviewBtn').disabled = true;
  try {
    const ocrText = $('#ocrText').value.trim();
    await api.tasks.create(tasks.map((task) => ({
      ...task,
      attachmentPath: state.review.attachmentPath,
      ocrText
    })));
    closeModal('reviewModal');
    state.review = null;
    state.section = tasks.some((task) => task.category === '等待他人') ? 'waiting' : 'today';
    await reloadTasks();
    toast(`已加入 ${tasks.length} 条待办`);
  } catch (error) {
    toast(`保存失败：${error.message}`);
  } finally {
    $('#saveReviewBtn').disabled = false;
  }
}

async function restructureReview() {
  const text = $('#ocrText').value.trim();
  if (!text) { toast('请先输入或粘贴文字'); return; }
  $('#restructureBtn').disabled = true;
  $('#restructureBtn').textContent = '正在整理…';
  try {
    const result = await api.capture.restructure(text);
    state.review.tasks = result.tasks;
    renderReviewTasks();
    $('#reviewWarning').textContent = result.warning || '';
    $('#reviewWarning').classList.toggle('hidden', !result.warning);
  } catch (error) {
    toast(`整理失败：${error.message}`);
  } finally {
    $('#restructureBtn').disabled = false;
    $('#restructureBtn').textContent = '按修改后的文字重新整理';
  }
}

function formatShortcut(value) {
  return String(value || '').replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
}

async function openSettings() {
  state.settings = await api.settings.get();
  const s = state.settings;
  $('#alwaysOnTop').checked = Boolean(s.alwaysOnTop);
  $('#launchAtLogin').checked = Boolean(s.launchAtLogin);
  $('#themeStyle').value = s.themeStyle || 'green';
  $('#customThemeColor').value = normalizeHex(s.customThemeColor);
  $('#customThemeRow').classList.toggle('hidden', $('#themeStyle').value !== 'custom');
  $('#glassMaterial').value = s.glassMaterial || 'acrylic';
  $('#glassTint').value = Math.round((s.glassTint || .34) * 100);
  $('#glassTintValue').textContent = `${$('#glassTint').value}%`;
  $('#shortcut').value = s.shortcut;
  $('#ocrMode').value = s.ocrMode;
  $('#ocrEndpoint').value = s.ocrEndpoint;
  $('#aiEnabled').checked = Boolean(s.aiEnabled);
  $('#aiProvider').value = s.aiProvider || (String(s.aiBaseUrl).includes('deepseek') ? 'deepseek' : 'openai');
  $('#aiApiStyle').value = s.aiApiStyle;
  $('#aiBaseUrl').value = s.aiBaseUrl;
  $('#aiModel').value = s.aiModel;
  $('#aiApiKey').value = '';
  $('#aiApiKey').placeholder = s.hasAiKey ? '已安全保存（留空不修改）' : '未设置';
  $('#clearAiKey').checked = false;
  $('#keyStatus').textContent = s.hasAiKey ? '已有密钥' : '尚未设置';
  openModal('settingsModal');
}

function collectSettings() {
  const preset = AI_PRESETS[$('#aiProvider').value];
  return {
    alwaysOnTop: $('#alwaysOnTop').checked,
    launchAtLogin: $('#launchAtLogin').checked,
    themeStyle: $('#themeStyle').value,
    customThemeColor: normalizeHex($('#customThemeColor').value),
    glassMaterial: $('#glassMaterial').value,
    glassTint: Number($('#glassTint').value) / 100,
    shortcut: $('#shortcut').value,
    ocrMode: $('#ocrMode').value,
    ocrEndpoint: $('#ocrEndpoint').value.trim() || 'http://127.0.0.1:1224',
    aiEnabled: $('#aiEnabled').checked,
    aiProvider: $('#aiProvider').value,
    aiApiStyle: $('#aiApiStyle').value,
    aiBaseUrl: $('#aiBaseUrl').value.trim() || preset?.baseUrl || 'https://api.openai.com/v1',
    aiModel: $('#aiModel').value.trim() || preset?.model || ($('#aiApiStyle').value === 'responses' ? 'gpt-5-mini' : 'gpt-4o-mini'),
    aiApiKey: $('#clearAiKey').checked ? '__CLEAR__' : $('#aiApiKey').value.trim()
  };
}

async function initialize() {
  const now = new Date();
  $('#todayLabel').textContent = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  state.settings = await api.settings.get();
  applyAppearance(state.settings);
  applyTheme(state.settings);
  $('#pinBtn').classList.toggle('active', Boolean(state.settings.alwaysOnTop));
  $('#shortcutLabel').textContent = `${formatShortcut(state.settings.shortcut)} 随时截图`;
  await reloadTasks();
}

$('#tabs').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-section]');
  if (!button) return;
  state.section = button.dataset.section;
  renderTasks();
});

$('#taskList').addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const card = event.target.closest('.task-card');
  if (!action || !card) return;
  const task = state.tasks.find((item) => item.id === card.dataset.id);
  if (!task) return;
  if (action === 'toggle') {
    await api.tasks.update(task.id, { status: task.status === 'completed' ? 'active' : 'completed' });
    await reloadTasks();
  } else if (action === 'edit') {
    openEditor(task);
  } else if (action === 'attachment') {
    const result = await api.attachment.open(task.attachment_path);
    if (!result.ok) toast(result.message || '无法打开附件');
  }
});

$('#quickAddBtn').addEventListener('click', addQuickTask);
$('#quickInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') addQuickTask(); });
$('#captureBtn').addEventListener('click', async () => {
  const result = await api.capture.start();
  if (!result.ok) toast(result.message);
});
$('#minimizeBtn').addEventListener('click', api.window.minimize);
$('#hideBtn').addEventListener('click', api.window.hide);
$('#pinBtn').addEventListener('click', async () => {
  const pinned = await api.window.togglePin();
  $('#pinBtn').classList.toggle('active', pinned);
  toast(pinned ? '窗口已置顶' : '已取消置顶');
});
$('#settingsBtn').addEventListener('click', openSettings);

$$('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
$$('.modal').forEach((modal) => modal.addEventListener('mousedown', (event) => {
  if (event.target === modal) closeModal(modal.id);
}));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $$('.modal.open').forEach((modal) => closeModal(modal.id));
});

$('#editForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await api.tasks.update($('#editId').value, {
    title: $('#editTitle').value.trim(),
    dueAt: $('#editDueAt').value || null,
    priority: $('#editPriority').value,
    category: $('#editCategory').value,
    notes: $('#editNotes').value.trim()
  });
  closeModal('editModal');
  await reloadTasks();
  toast('待办已更新');
});
$('#deleteTaskBtn').addEventListener('click', async () => {
  if (!confirm('确定删除这条待办吗？原截图文件会保留。')) return;
  await api.tasks.delete($('#editId').value);
  closeModal('editModal');
  await reloadTasks();
  toast('待办已删除');
});

$('#reviewTasks').addEventListener('click', (event) => {
  if (!event.target.closest('.remove-review')) return;
  const item = event.target.closest('.review-item');
  state.review.tasks = collectReviewTasks();
  state.review.tasks.splice(Number(item.dataset.index), 1);
  if (!state.review.tasks.length) state.review.tasks.push(emptyReviewTask());
  renderReviewTasks();
});
$('#addReviewTaskBtn').addEventListener('click', () => {
  state.review.tasks = collectReviewTasks();
  state.review.tasks.push(emptyReviewTask());
  renderReviewTasks();
});
$('#restructureBtn').addEventListener('click', restructureReview);
$('#saveReviewBtn').addEventListener('click', saveReview);

$('#glassTint').addEventListener('input', () => {
  $('#glassTintValue').textContent = `${$('#glassTint').value}%`;
  applyAppearance({ glassMaterial: $('#glassMaterial').value, glassTint: Number($('#glassTint').value) / 100 });
});
$('#glassMaterial').addEventListener('change', () => {
  applyAppearance({ glassMaterial: $('#glassMaterial').value, glassTint: Number($('#glassTint').value) / 100 });
});
$('#themeStyle').addEventListener('change', () => {
  const themeStyle = $('#themeStyle').value;
  $('#customThemeRow').classList.toggle('hidden', themeStyle !== 'custom');
  applyTheme({ themeStyle, customThemeColor: $('#customThemeColor').value });
});
$('#customThemeColor').addEventListener('input', () => {
  applyTheme({ themeStyle: 'custom', customThemeColor: $('#customThemeColor').value });
});
$('#aiProvider').addEventListener('change', () => applyAiPreset($('#aiProvider').value, true));
$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.settings = await api.settings.save(collectSettings());
  applyAppearance(state.settings);
  applyTheme(state.settings);
  $('#pinBtn').classList.toggle('active', Boolean(state.settings.alwaysOnTop));
  $('#shortcutLabel').textContent = `${formatShortcut(state.settings.shortcut)} 随时截图`;
  closeModal('settingsModal');
  toast('设置已保存');
});
$('#testOcrBtn').addEventListener('click', async () => {
  const button = $('#testOcrBtn'); button.disabled = true; button.textContent = '测试中…';
  const result = await api.settings.testOcr({ ocrEndpoint: $('#ocrEndpoint').value.trim() });
  toast(result.message); button.disabled = false; button.textContent = '测试 Umi-OCR';
});
$('#testAiBtn').addEventListener('click', async () => {
  const button = $('#testAiBtn'); button.disabled = true; button.textContent = '测试中…';
  const result = await api.settings.testAi(collectSettings());
  toast(result.message); button.disabled = false; button.textContent = '测试 AI 接口';
});
$('#getAiKeyBtn').addEventListener('click', () => {
  const preset = AI_PRESETS[$('#aiProvider').value];
  if (!preset) { toast('请到接口服务商网站创建 API Key'); return; }
  api.app.openExternal(preset.keyUrl);
});
$('#downloadUmiBtn').addEventListener('click', () => api.app.openExternal('https://github.com/hiroi-sora/Umi-OCR/releases/latest'));

api.capture.onProcessing(beginReview);
api.capture.onResult(showReviewResult);
api.app.onShortcutStatus((status) => {
  if (!status.ok) toast(status.message);
});
api.app.onAppearanceChanged(applyAppearance);

let lightFrame = 0;
document.addEventListener('pointermove', (event) => {
  if (lightFrame) return;
  lightFrame = requestAnimationFrame(() => {
    lightFrame = 0;
    const shell = $('.app-shell');
    const bounds = shell.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    shell.style.setProperty('--light-x', `${x.toFixed(1)}%`);
    shell.style.setProperty('--light-y', `${y.toFixed(1)}%`);
  });
});

initialize().catch((error) => toast(`启动失败：${error.message}`));
