'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function normalizeEndpoint(endpoint) {
  return String(endpoint || 'http://127.0.0.1:1224').trim().replace(/\/+$/, '');
}

function normalizeOcrText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

async function callUmiOcr(imagePath, settings = {}) {
  const endpoint = normalizeEndpoint(settings.ocrEndpoint);
  const apiUrl = endpoint.endsWith('/api/ocr') ? endpoint : `${endpoint}/api/ocr`;
  const timeout = withTimeout(Number(settings.ocrTimeoutMs) || 20000);
  try {
    const base64 = fs.readFileSync(imagePath).toString('base64');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64,
        options: {
          'ocr.language': 'models/config_chinese.txt',
          'ocr.cls': true,
          'ocr.limit_side_len': 4320,
          'tbpu.parser': 'multi_none',
          'data.format': 'text'
        }
      }),
      signal: timeout.signal
    });
    if (!response.ok) throw new Error(`Umi-OCR HTTP ${response.status}`);
    const result = await response.json();
    if (result.code === 101) return { text: '', engine: 'Umi-OCR', message: '截图中没有识别到文字' };
    if (result.code !== 100) throw new Error(result.data || `Umi-OCR 错误 ${result.code}`);
    const text = normalizeOcrText(Array.isArray(result.data)
      ? result.data.map((item) => `${item.text || ''}${item.end || '\n'}`).join('').trim()
      : String(result.data || '').trim());
    return { text, engine: 'Umi-OCR', message: '' };
  } finally {
    timeout.dispose();
  }
}

function callWindowsOcr(imagePath, scriptPath, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('Windows OCR 仅能在 Windows 上使用'));
      return;
    }
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-STA',
      '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      '-ImagePath', imagePath
    ], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Windows OCR 识别超时'));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr.trim() || `Windows OCR 退出码 ${code}`));
      else resolve({ text: normalizeOcrText(stdout), engine: 'Windows OCR', message: '' });
    });
  });
}

async function testUmiOcr(settings = {}) {
  const endpoint = normalizeEndpoint(settings.ocrEndpoint);
  const optionsUrl = endpoint.endsWith('/api/ocr')
    ? `${endpoint}/get_options`
    : `${endpoint}/api/ocr/get_options`;
  const timeout = withTimeout(5000);
  try {
    const response = await fetch(optionsUrl, { signal: timeout.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.json();
    return { ok: true, message: '已连接到 Umi-OCR' };
  } catch (error) {
    return { ok: false, message: `未连接：${error.name === 'AbortError' ? '请求超时' : error.message}` };
  } finally {
    timeout.dispose();
  }
}

async function recognizeImage(imagePath, settings, resourcesPath) {
  const mode = settings.ocrMode || 'auto';
  const errors = [];

  if (mode === 'auto' || mode === 'umi') {
    try {
      return await callUmiOcr(imagePath, settings);
    } catch (error) {
      errors.push(`Umi-OCR：${error.message}`);
    }
  }

  if (mode === 'auto' || mode === 'windows') {
    try {
      const scriptPath = path.join(resourcesPath, 'scripts', 'windows-ocr.ps1');
      return await callWindowsOcr(imagePath, scriptPath, Number(settings.ocrTimeoutMs) || 25000);
    } catch (error) {
      errors.push(`Windows OCR：${error.message}`);
    }
  }

  return {
    text: '',
    engine: '手动输入',
    message: errors.join('\n') || '未启用 OCR；请手动输入文字'
  };
}

module.exports = {
  callUmiOcr,
  callWindowsOcr,
  normalizeEndpoint,
  normalizeOcrText,
  recognizeImage,
  testUmiOcr
};
