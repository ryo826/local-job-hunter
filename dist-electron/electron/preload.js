"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electronAPI = {
    db: {
        getCompanies: (filters) => electron_1.ipcRenderer.invoke('db:getCompanies', filters),
        getCompany: (id) => electron_1.ipcRenderer.invoke('db:getCompany', id),
        updateCompany: (id, updates) => electron_1.ipcRenderer.invoke('db:updateCompany', id, updates),
    },
    ai: {
        analyze: (id) => electron_1.ipcRenderer.invoke('ai:analyze', id),
    },
    scraper: {
        start: (options) => electron_1.ipcRenderer.invoke('scraper:start', options),
        stop: () => electron_1.ipcRenderer.invoke('scraper:stop'),
        onProgress: (callback) => {
            electron_1.ipcRenderer.on('scraper:progress', (_event, progress) => callback(progress));
        },
        offProgress: () => {
            electron_1.ipcRenderer.removeAllListeners('scraper:progress');
        },
        onLog: (callback) => {
            electron_1.ipcRenderer.on('scraper:log', (_event, message) => callback(message));
        },
        offLog: () => {
            electron_1.ipcRenderer.removeAllListeners('scraper:log');
        },
    },
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
