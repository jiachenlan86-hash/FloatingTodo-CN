'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  safeStorage,
  screen,
  shell
} = require('electron');
const { TodoDatabase } = require('./db.cjs');
const { recognizeImage, testUmiOcr } = require('./services/ocr.cjs');
const { structureText, testAi } = require('./services/ai.cjs');

app.setName('浮待 Todo');

let mainWindow = null;
let tray = null;
let database = null;
let captureWindows = [];
let captureInProgress = false;
let captureStartedVisible = true;
let isQuitting = false;
let saveBoundsTimer = null;

function appRoot(...parts) {
  return path.join(__dirname, '..', ...parts);
}

function unpackedResource(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', ...parts)
    : appRoot(...parts);
}

function encodeSecret(value) {
  if (!value) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return `encrypted:${safeStorage.encryptString(value).toString('base64')}`;
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function decodeSecret(value) {
  if (!value) return '';
  try {
    if (value.startsWith('encrypted:') && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value.slice(10), 'base64'));
    }
    if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
  } catch {
    return '';
  }
  return value;
}

function getSettingsInternal() {
  return database.getSettings();
}

function getSettingsForRenderer() {
  const settings = getSettingsInternal();
  return {
    ...settings,
    aiApiKey: '',
    hasAiKey: Boolean(decodeSecret(settings.aiApiKey)),
    isPackaged: app.isPackaged
  };
}

function normalizedGlassMaterial(value) {
  if (process.platform !== 'win32') return 'none';
  return ['acrylic', 'mica', 'none'].includes(value) ? value : 'acrylic';
}

function applyWindowMaterial(settings) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const material = normalizedGlassMaterial(settings.glassMaterial);
  mainWindow.setOpacity(1);
  try {
    mainWindow.setBackgroundMaterial(material);
  } catch {
    try { mainWindow.setBackgroundMaterial('none'); } catch { /* 旧版 Windows 使用网页半透明兜底 */ }
  }
  mainWindow.webContents.send('appearance:changed', {
    glassMaterial: material,
    glassTint: Math.max(0.12, Math.min(0.82, Number(settings.glassTint) || 0.34))
  });
}

function createMainWindow() {
  const settings = getSettingsInternal();
  const saved = settings.windowBounds || {};
  mainWindow = new BrowserWindow({
    width: saved.width || 390,
    height: saved.height || 720,
    x: saved.x,
    y: saved.y,
    minWidth: 340,
    minHeight: 520,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: normalizedGlassMaterial(settings.glassMaterial),
    roundedCorners: true,
    accentColor: false,
    resizable: true,
    show: false,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    skipTaskbar: false,
    icon: appRoot('assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow.show();
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  const scheduleBoundsSave = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!mainWindow?.isDestroyed() && !mainWindow.isMaximized()) {
        database.setSettings({ windowBounds: mainWindow.getBounds() });
      }
    }, 350);
  };
  mainWindow.on('move', scheduleBoundsSave);
  mainWindow.on('resize', scheduleBoundsSave);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(appRoot('assets', 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromPath(appRoot('assets', 'icon.png')) : icon);
  tray.setToolTip('浮待 Todo · 中文截图生成待办');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示待办', click: showMainWindow },
    { label: '截图生成待办', click: startCapture },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', showMainWindow);
}

function registerCaptureShortcut(accelerator) {
  globalShortcut.unregisterAll();
  let ok = false;
  try { ok = globalShortcut.register(accelerator || 'CommandOrControl+Shift+A', startCapture); } catch { ok = false; }
  mainWindow?.webContents.send('shortcut:status', {
    ok,
    shortcut: accelerator,
    message: ok ? '截图快捷键已生效' : '快捷键被其他软件占用，请在设置中更换'
  });
  return ok;
}

function closeCaptureWindows() {
  for (const window of captureWindows) {
    if (!window.isDestroyed()) window.destroy();
  }
  captureWindows = [];
}

async function startCapture() {
  if (captureInProgress) return { ok: false, message: '截图正在进行中' };
  captureInProgress = true;
  captureStartedVisible = Boolean(mainWindow?.isVisible());
  mainWindow?.hide();
  closeCaptureWindows();

  try {
    await new Promise((resolve) => setTimeout(resolve, 180));
    const displays = screen.getAllDisplays();
    const maxWidth = Math.max(...displays.map((display) => Math.round(display.bounds.width * display.scaleFactor)));
    const maxHeight = Math.max(...displays.map((display) => Math.round(display.bounds.height * display.scaleFactor)));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight },
      fetchWindowIcons: false
    });

    await Promise.all(displays.map(async (display, index) => {
      const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[index] || sources[0];
      if (!source) throw new Error('无法读取屏幕画面');
      const overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: false,
        backgroundColor: '#111827',
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        fullscreenable: false,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });
      captureWindows.push(overlay);
      overlay.setAlwaysOnTop(true, 'screen-saver');
      await overlay.loadFile(path.join(__dirname, 'renderer', 'capture.html'));
      overlay.webContents.send('capture:init', {
        imageDataUrl: source.thumbnail.toDataURL(),
        display: display.bounds
      });
      overlay.show();
    }));
    captureWindows[0]?.focus();
    return { ok: true };
  } catch (error) {
    closeCaptureWindows();
    captureInProgress = false;
    showMainWindow();
    mainWindow?.webContents.send('capture:result', { error: `无法开始截图：${error.message}` });
    return { ok: false, message: error.message };
  }
}

function saveScreenshot(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/png;base64,(.+)$/);
  if (!match) throw new Error('截图数据格式无效');
  const folder = path.join(app.getPath('userData'), 'attachments', new Date().toISOString().slice(0, 7));
  fs.mkdirSync(folder, { recursive: true });
  const attachmentPath = path.join(folder, `${Date.now()}-${randomUUID().slice(0, 8)}.png`);
  fs.writeFileSync(attachmentPath, Buffer.from(match[1], 'base64'));
  return attachmentPath;
}

async function processScreenshot(dataUrl) {
  closeCaptureWindows();
  captureInProgress = false;
  showMainWindow();
  mainWindow.webContents.send('capture:processing', { previewDataUrl: dataUrl });

  try {
    const attachmentPath = saveScreenshot(dataUrl);
    const settings = getSettingsInternal();
    const resourcesPath = unpackedResource();
    const ocr = await recognizeImage(attachmentPath, settings, resourcesPath);
    const apiKey = decodeSecret(settings.aiApiKey);
    const structured = await structureText(ocr.text, settings, apiKey);
    mainWindow.webContents.send('capture:result', {
      tasks: structured.tasks,
      ocrText: ocr.text,
      engine: ocr.engine,
      warning: [ocr.message, structured.warning].filter(Boolean).join('\n'),
      attachmentPath,
      previewDataUrl: dataUrl
    });
  } catch (error) {
    mainWindow.webContents.send('capture:result', { error: `截图处理失败：${error.message}`, previewDataUrl: dataUrl });
  }
}

function cancelCapture() {
  closeCaptureWindows();
  captureInProgress = false;
  if (captureStartedVisible) showMainWindow();
}

function applyRuntimeSettings(settings) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(Boolean(settings.alwaysOnTop));
    applyWindowMaterial(settings);
  }
  registerCaptureShortcut(settings.shortcut);
  if (process.platform === 'win32' && app.isPackaged) {
    const launchPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({
      openAtLogin: Boolean(settings.launchAtLogin),
      path: launchPath,
      args: ['--hidden'],
      name: 'FloatingTodoCN'
    });
  }
}

function registerIpc() {
  ipcMain.handle('tasks:list', () => database.listTasks());
  ipcMain.handle('tasks:create', (_event, taskInputs) => {
    const list = Array.isArray(taskInputs) ? taskInputs : [taskInputs];
    return database.createTasks(list);
  });
  ipcMain.handle('tasks:update', (_event, { id, changes }) => database.updateTask(id, changes));
  ipcMain.handle('tasks:delete', (_event, id) => database.deleteTask(id));

  ipcMain.handle('settings:get', () => getSettingsForRenderer());
  ipcMain.handle('settings:set', (_event, changes) => {
    const safeChanges = { ...changes };
    if (typeof safeChanges.aiApiKey === 'string') {
      if (safeChanges.aiApiKey === '__CLEAR__') safeChanges.aiApiKey = '';
      else if (safeChanges.aiApiKey.trim()) safeChanges.aiApiKey = encodeSecret(safeChanges.aiApiKey.trim());
      else delete safeChanges.aiApiKey;
    }
    const settings = database.setSettings(safeChanges);
    applyRuntimeSettings(settings);
    return getSettingsForRenderer();
  });
  ipcMain.handle('ocr:test', async (_event, changes) => testUmiOcr({ ...getSettingsInternal(), ...changes }));
  ipcMain.handle('ai:test', async (_event, changes) => {
    const current = getSettingsInternal();
    const key = changes.aiApiKey?.trim() || decodeSecret(current.aiApiKey);
    return testAi({ ...current, ...changes }, key);
  });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:hide', () => mainWindow?.hide());
  ipcMain.handle('window:toggle-pin', () => {
    const next = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(next);
    database.setSettings({ alwaysOnTop: next });
    return next;
  });

  ipcMain.handle('capture:start', startCapture);
  ipcMain.on('capture:selected', (_event, dataUrl) => processScreenshot(dataUrl));
  ipcMain.on('capture:cancel', cancelCapture);
  ipcMain.handle('capture:restructure', async (_event, text) => {
    const settings = getSettingsInternal();
    return structureText(String(text || ''), settings, decodeSecret(settings.aiApiKey));
  });

  ipcMain.handle('attachment:open', async (_event, attachmentPath) => {
    if (!attachmentPath || !fs.existsSync(attachmentPath)) return { ok: false, message: '附件文件不存在' };
    const result = await shell.openPath(attachmentPath);
    return { ok: !result, message: result };
  });
  ipcMain.handle('app:open-external', async (_event, url) => {
    const allowed = ['https://github.com/hiroi-sora/Umi-OCR', 'https://platform.openai.com/', 'https://platform.deepseek.com/'];
    if (!allowed.some((prefix) => String(url).startsWith(prefix))) throw new Error('不允许打开此链接');
    await shell.openExternal(url);
    return true;
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(() => {
    database = new TodoDatabase(path.join(app.getPath('userData'), 'floating-todo.sqlite'));
    registerIpc();
    createMainWindow();
    createTray();
    applyRuntimeSettings(getSettingsInternal());
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  clearTimeout(saveBoundsTimer);
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  database?.close();
});
app.on('window-all-closed', () => {
  // Windows 上继续驻留托盘。
});
