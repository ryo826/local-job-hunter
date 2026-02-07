import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Windows console UTF-8 fix
if (process.platform === 'win32') {
    // Set console code page to UTF-8
    try {
        spawn('chcp', ['65001'], { shell: true, stdio: 'ignore' });
    } catch (e) {
        // ignore
    }

    // Set output encoding
    process.stdout.setDefaultEncoding?.('utf8');
    process.stderr.setDefaultEncoding?.('utf8');

    // Override console.log to handle encoding
    const originalLog = console.log;
    console.log = (...args: any[]) => {
        const output = args.map(arg => {
            if (typeof arg === 'string') {
                return arg;
            }
            return String(arg);
        }).join(' ');
        originalLog(output);
    };
}
import { SupabaseCompanyRepository } from './repositories/SupabaseCompanyRepository';
import { ScrapingEngine } from './scraping-engine';
import { UpdateEngine } from './update-engine';
import { getExportService } from './services/ExportService';

const companyRepository = new SupabaseCompanyRepository();

// Settings file management
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): Record<string, string> {
    try {
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
    } catch (e) {
        console.error('[Main] Failed to load settings:', e);
    }
    return {};
}

function saveSettings(settings: Record<string, string>): void {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

// Load Google Maps API key from settings.json
const settings = loadSettings();
if (settings.GOOGLE_MAPS_API_KEY) {
    process.env.GOOGLE_MAPS_API_KEY = settings.GOOGLE_MAPS_API_KEY;
}
console.log('[Main] GOOGLE_MAPS_API_KEY set:', !!process.env.GOOGLE_MAPS_API_KEY);

let mainWindow: BrowserWindow | null = null;
let scrapingEngine: ScrapingEngine | null = null;
let updateEngine: UpdateEngine | null = null;

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
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
}

app.whenReady().then(async () => {
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
    return await companyRepository.getAll(filters || {});
});

ipcMain.handle('db:getCompany', async (_event, id) => {
    return await companyRepository.getById(id);
});

ipcMain.handle('db:getDistinctAreas', async () => {
    return companyRepository.getDistinctAreas();
});

ipcMain.handle('db:getDistinctJobTitles', async () => {
    return companyRepository.getDistinctJobTitles();
});

ipcMain.handle('db:updateCompany', async (_event, id, updates) => {
    try {
        await companyRepository.update(id, updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
});

// 会社を削除（複数対応）
ipcMain.handle('db:deleteCompanies', async (_event: any, ids: number[]) => {
    try {
        const deleted = await companyRepository.deleteMany(ids);
        return { success: true, deleted };
    } catch (error) {
        return { success: false, error: String(error) };
    }
});

ipcMain.handle('db:exportCsv', async (_event, options) => {
    try {
        const exportService = getExportService();
        return await exportService.exportToCSV(options);
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

ipcMain.handle('scraper:confirm', async (_event, proceed: boolean) => {
    if (scrapingEngine) {
        scrapingEngine.confirm(proceed);
    }
    return { success: true };
});

// Google Maps API Enrichment
ipcMain.handle('enrich:startPhoneLookup', async () => {
    try {
        const { getGoogleMapsService } = await import('./services/GoogleMapsService');
        const service = getGoogleMapsService();

        if (!service) {
            const apiKey = process.env.GOOGLE_MAPS_API_KEY;
            let errorMsg = 'GOOGLE_MAPS_API_KEY not configured. Please set it in .env file.';
            if (apiKey === 'your_google_maps_api_key_here' || apiKey?.startsWith('your_')) {
                errorMsg = 'GOOGLE_MAPS_API_KEY is a placeholder. Please set a valid Google Maps API key in .env file.';
            }
            console.error('[PhoneLookup]', errorMsg);
            return { success: false, error: errorMsg };
        }

        // 電話番号がない会社を取得
        const allCompaniesForPhone = await companyRepository.getAll({});
        const companiesWithoutPhone = allCompaniesForPhone
            .filter(c => !c.phone);

        if (companiesWithoutPhone.length === 0) {
            return { success: true, message: 'All companies already have phone numbers', updated: 0 };
        }

        let updated = 0;
        const total = companiesWithoutPhone.length;

        for (let i = 0; i < companiesWithoutPhone.length; i++) {
            const company = companiesWithoutPhone[i];

            // Progress notification
            mainWindow?.webContents.send('enrich:progress', {
                current: i + 1,
                total,
                companyName: company.company_name,
            });

            const phone = await service.findCompanyPhone(company.company_name, company.address);

            if (phone) {
                await companyRepository.update(company.id, { phone });
                updated++;
                mainWindow?.webContents.send('enrich:log', `Found phone for ${company.company_name}: ${phone}`);
            } else {
                mainWindow?.webContents.send('enrich:log', `No phone found for ${company.company_name}`);
            }
        }

        return { success: true, updated, total };
    } catch (error) {
        console.error('Enrichment error:', error);
        return { success: false, error: String(error) };
    }
});

// Get companies without phone numbers count
ipcMain.handle('enrich:getStats', async () => {
    const allCompanies = await companyRepository.getAll({});
    const withPhone = allCompanies.filter(c => c.phone);
    const withoutPhone = allCompanies.filter(c => !c.phone);

    return {
        total: allCompanies.length,
        withPhone: withPhone.length,
        withoutPhone: withoutPhone.length,
    };
});

// Update Engine Handlers
ipcMain.handle('update:start', async (_event, companyIds?: number[]) => {
    if (updateEngine) {
        return { success: false, error: 'Update already in progress' };
    }

    updateEngine = new UpdateEngine();

    try {
        const result = await updateEngine.start(
            companyIds,
            (progress) => {
                mainWindow?.webContents.send('update:progress', progress);
            },
            (message) => {
                mainWindow?.webContents.send('update:log', message);
            }
        );
        return result;
    } catch (error) {
        return { success: false, error: String(error) };
    } finally {
        updateEngine = null;
    }
});

ipcMain.handle('update:stop', async () => {
    if (updateEngine) {
        await updateEngine.stop();
        updateEngine = null;
    }
    return { success: true };
});

// Settings Handlers
ipcMain.handle('settings:getApiKey', async () => {
    const s = loadSettings();
    return s.GOOGLE_MAPS_API_KEY || '';
});

ipcMain.handle('settings:saveApiKey', async (_event, apiKey: string) => {
    const s = loadSettings();
    s.GOOGLE_MAPS_API_KEY = apiKey;
    saveSettings(s);
    process.env.GOOGLE_MAPS_API_KEY = apiKey;
    return { success: true };
});

ipcMain.handle('settings:hasApiKey', async () => {
    return !!process.env.GOOGLE_MAPS_API_KEY;
});
