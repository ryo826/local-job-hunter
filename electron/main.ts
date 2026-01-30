import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initDB, companyRepository } from './database';
import { ScrapingEngine } from './scraping-engine';

let mainWindow: BrowserWindow | null = null;
let scrapingEngine: ScrapingEngine | null = null;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Local Job Hunter',
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    initDB();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers
ipcMain.handle('db:getCompanies', async (_event, filters) => {
    return companyRepository.getAll(filters || {});
});

ipcMain.handle('db:getCompany', async (_event, id) => {
    return companyRepository.getById(id);
});

ipcMain.handle('db:updateCompany', async (_event, id, updates) => {
    try {
        companyRepository.update(id, updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
});

ipcMain.handle('scraper:start', async (_event, options) => {
    if (scrapingEngine) {
        return { success: false, error: 'Scraping already in progress' };
    }

    scrapingEngine = new ScrapingEngine();

    try {
        const result = await scrapingEngine.start(
            options,
            (progress) => {
                mainWindow?.webContents.send('scraper:progress', progress);
            },
            (message) => {
                mainWindow?.webContents.send('scraper:log', message);
            }
        );
        return result;
    } catch (error) {
        return { success: false, error: String(error) };
    } finally {
        scrapingEngine = null;
    }
});

ipcMain.handle('scraper:stop', async () => {
    if (scrapingEngine) {
        await scrapingEngine.stop();
        scrapingEngine = null;
    }
    return { success: true };
});
