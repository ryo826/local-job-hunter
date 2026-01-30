import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { initDB, companyRepository } from './database';
import { ScrapingEngine } from './scraping-engine';
import { geminiService } from './services/gemini';

// Load environment variables
dotenv.config();

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

ipcMain.handle('ai:analyze', async (_event, id) => {
    try {
        const company = companyRepository.getById(id);
        if (!company) {
            return { success: false, error: 'Company not found' };
        }

        // Create context for AI analysis
        const textContext = [
            `社名: ${company.company_name}`,
            company.industry ? `業種: ${company.industry}` : '',
            company.address ? `住所: ${company.address}` : '',
            company.job_title ? `募集職種: ${company.job_title}` : '',
            company.salary_text ? `給与: ${company.salary_text}` : '',
            company.representative ? `代表者: ${company.representative}` : '',
            company.establishment ? `設立: ${company.establishment}` : '',
            company.employees ? `従業員数: ${company.employees}` : '',
            company.revenue ? `売上高: ${company.revenue}` : '',
            company.note ? `メモ: ${company.note}` : ''
        ].filter(Boolean).join('\n');

        const analysis = await geminiService.analyzeCompany(textContext);

        // Save AI analysis results to database
        companyRepository.update(id, {
            ai_summary: analysis.summary,
            ai_tags: JSON.stringify(analysis.tags)
        });

        return { success: true, data: analysis };
    } catch (error) {
        console.error('AI analysis error:', error);
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
