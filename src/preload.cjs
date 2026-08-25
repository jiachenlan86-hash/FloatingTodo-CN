'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('floatingTodo', {
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    create: (tasks) => ipcRenderer.invoke('tasks:create', tasks),
    update: (id, changes) => ipcRenderer.invoke('tasks:update', { id, changes }),
    delete: (id) => ipcRenderer.invoke('tasks:delete', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (changes) => ipcRenderer.invoke('settings:set', changes),
    testOcr: (changes) => ipcRenderer.invoke('ocr:test', changes),
    testAi: (changes) => ipcRenderer.invoke('ai:test', changes)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    hide: () => ipcRenderer.send('window:hide'),
    togglePin: () => ipcRenderer.invoke('window:toggle-pin')
  },
  capture: {
    start: () => ipcRenderer.invoke('capture:start'),
    selected: (dataUrl) => ipcRenderer.send('capture:selected', dataUrl),
    cancel: () => ipcRenderer.send('capture:cancel'),
    restructure: (text) => ipcRenderer.invoke('capture:restructure', text),
    onInit: (callback) => subscribe('capture:init', callback),
    onProcessing: (callback) => subscribe('capture:processing', callback),
    onResult: (callback) => subscribe('capture:result', callback)
  },
  attachment: {
    open: (attachmentPath) => ipcRenderer.invoke('attachment:open', attachmentPath)
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    onShortcutStatus: (callback) => subscribe('shortcut:status', callback),
    onAppearanceChanged: (callback) => subscribe('appearance:changed', callback)
  }
});
