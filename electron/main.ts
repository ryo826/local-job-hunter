import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { initDB, companyRepository } from './database';
import { ScrapingEngine } from './scraping-engine';
import { getExportService } from './services/ExportService';

// Load environment variables from .env file
// In development: .env is in project root
// In production: .env should be in project root (2 levels up from dist-electron/electron/)
const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });
console.log('[Main] Loading .env from:', envPath);
console.log('[Main] GOOGLE_MAPS_API_KEY set:', !!process.env.GOOGLE_MAPS_API_KEY);

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
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
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
        const companiesWithoutPhone = companyRepository.getAll({})
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
                companyRepository.update(company.id, { phone });
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
    const allCompanies = companyRepository.getAll({});
    const withPhone = allCompanies.filter(c => c.phone);
    const withoutPhone = allCompanies.filter(c => !c.phone);

    return {
        total: allCompanies.length,
        withPhone: withPhone.length,
        withoutPhone: withoutPhone.length,
    };
});
