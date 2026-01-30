"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./database");
const scraping_engine_1 = require("./scraping-engine");
const gemini_1 = require("./services/gemini");
// Load environment variables
dotenv_1.default.config();
let mainWindow = null;
let scrapingEngine = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Local Job Hunter',
    });
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
}
electron_1.app.whenReady().then(() => {
    (0, database_1.initDB)();
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Handlers
electron_1.ipcMain.handle('db:getCompanies', async (_event, filters) => {
    return database_1.companyRepository.getAll(filters || {});
});
electron_1.ipcMain.handle('db:getCompany', async (_event, id) => {
    return database_1.companyRepository.getById(id);
});
electron_1.ipcMain.handle('db:updateCompany', async (_event, id, updates) => {
    try {
        database_1.companyRepository.update(id, updates);
        return { success: true };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
});
electron_1.ipcMain.handle('ai:analyze', async (_event, id) => {
    try {
        const company = database_1.companyRepository.getById(id);
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
        const analysis = await gemini_1.geminiService.analyzeCompany(textContext);
        // Save AI analysis results to database
        database_1.companyRepository.update(id, {
            ai_summary: analysis.summary,
            ai_tags: JSON.stringify(analysis.tags)
        });
        return { success: true, data: analysis };
    }
    catch (error) {
        console.error('AI analysis error:', error);
        return { success: false, error: String(error) };
    }
});
electron_1.ipcMain.handle('scraper:start', async (_event, options) => {
    if (scrapingEngine) {
        return { success: false, error: 'Scraping already in progress' };
    }
    scrapingEngine = new scraping_engine_1.ScrapingEngine();
    try {
        const result = await scrapingEngine.start(options, (progress) => {
            mainWindow?.webContents.send('scraper:progress', progress);
        }, (message) => {
            mainWindow?.webContents.send('scraper:log', message);
        });
        return result;
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
    finally {
        scrapingEngine = null;
    }
});
electron_1.ipcMain.handle('scraper:stop', async () => {
    if (scrapingEngine) {
        await scrapingEngine.stop();
        scrapingEngine = null;
    }
    return { success: true };
});
