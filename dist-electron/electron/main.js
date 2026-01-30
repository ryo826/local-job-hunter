"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./database");
const scraping_engine_1 = require("./scraping-engine");
// Load environment variables from .env file
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
// Google Maps API Enrichment
electron_1.ipcMain.handle('enrich:startPhoneLookup', async () => {
    try {
        const { getGoogleMapsService } = await Promise.resolve().then(() => __importStar(require('./services/GoogleMapsService')));
        const service = getGoogleMapsService();
        if (!service) {
            return { success: false, error: 'GOOGLE_MAPS_API_KEY not configured. Please set it in .env file.' };
        }
        // 電話番号がない会社を取得
        const companiesWithoutPhone = database_1.companyRepository.getAll({})
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
                database_1.companyRepository.update(company.id, { phone });
                updated++;
                mainWindow?.webContents.send('enrich:log', `Found phone for ${company.company_name}: ${phone}`);
            }
            else {
                mainWindow?.webContents.send('enrich:log', `No phone found for ${company.company_name}`);
            }
        }
        return { success: true, updated, total };
    }
    catch (error) {
        console.error('Enrichment error:', error);
        return { success: false, error: String(error) };
    }
});
// Get companies without phone numbers count
electron_1.ipcMain.handle('enrich:getStats', async () => {
    const allCompanies = database_1.companyRepository.getAll({});
    const withPhone = allCompanies.filter(c => c.phone);
    const withoutPhone = allCompanies.filter(c => !c.phone);
    return {
        total: allCompanies.length,
        withPhone: withPhone.length,
        withoutPhone: withoutPhone.length,
    };
});
