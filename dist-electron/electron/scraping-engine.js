"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapingEngine = void 0;
const playwright_1 = require("playwright");
const database_1 = require("./database");
const JobRepository_1 = require("./repositories/JobRepository");
const ScrapingLogRepository_1 = require("./repositories/ScrapingLogRepository");
const UpsertService_1 = require("./services/UpsertService");
const DataConverter_1 = require("./services/DataConverter");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const SMART_STOP_THRESHOLD = 50;
const TIMEOUT_MS = 60 * 60 * 1000; // 60 min
class ScrapingEngine {
    browser = null;
    isRunning = false;
    shouldStop = false;
    db;
    jobRepo;
    logRepo;
    upsertService;
    constructor() {
        // データベース接続を初期化
        const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'companies.db');
        this.db = new better_sqlite3_1.default(dbPath);
        this.jobRepo = new JobRepository_1.JobRepository(this.db);
        this.logRepo = new ScrapingLogRepository_1.ScrapingLogRepository(this.db);
        this.upsertService = new UpsertService_1.UpsertService(this.db);
    }
    async start(options, onProgress, onLog) {
        if (this.isRunning) {
            return { success: false, error: 'Scraping already in progress' };
        }
        this.isRunning = true;
        this.shouldStop = false;
        try {
            // Headless mode with stealth settings
            this.browser = await playwright_1.chromium.launch({
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox'
                ]
            });
            const strategies = this.loadStrategies(options.sources);
            const params = {
                keywords: options.keywords,
                location: options.location,
            };
            for (const strategy of strategies) {
                if (this.shouldStop)
                    break;
                const startTime = Date.now();
                let jobsFound = 0;
                let newJobs = 0;
                let updatedJobs = 0;
                let errors = 0;
                const context = await this.browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    locale: 'ja-JP',
                    timezoneId: 'Asia/Tokyo',
                    viewport: { width: 1920, height: 1080 }
                });
                const page = await context.newPage();
                // Login if needed
                if (strategy.login) {
                    onProgress({
                        current: 0, total: 0, newCount: 0, duplicateCount: 0,
                        source: strategy.source,
                        status: 'ログイン確認中...'
                    });
                    await strategy.login(page);
                }
                let consecutiveDuplicates = 0;
                let newCount = 0;
                let duplicateCount = 0;
                let current = 0;
                try {
                    const log = (msg) => {
                        console.log(`[${strategy.source}] ${msg}`);
                        onLog?.(`[${strategy.source}] ${msg}`);
                    };
                    for await (const company of strategy.scrape(page, params, log)) {
                        if (this.shouldStop)
                            break;
                        current++;
                        jobsFound++;
                        const uniqueKey = company.url;
                        const exists = database_1.companyRepository.exists(uniqueKey);
                        if (exists) {
                            consecutiveDuplicates++;
                            duplicateCount++;
                            if (consecutiveDuplicates >= SMART_STOP_THRESHOLD) {
                                onProgress({
                                    current, total: current, newCount, duplicateCount,
                                    source: strategy.source,
                                    status: `Smart Stop: 連続${SMART_STOP_THRESHOLD}件の重複を検出 (停止)`
                                });
                                break;
                            }
                        }
                        else {
                            consecutiveDuplicates = 0;
                            newCount++;
                        }
                        // 既存: CompanyDataとして保存(B2B営業用)
                        database_1.companyRepository.safeUpsert(company);
                        // 新規: Job型に変換して保存(求人情報管理用)
                        try {
                            const job = DataConverter_1.DataConverter.companyDataToJob(company);
                            const isNew = this.upsertService.upsert(job);
                            if (isNew) {
                                newJobs++;
                            }
                            else {
                                updatedJobs++;
                            }
                        }
                        catch (error) {
                            console.error(`Failed to convert/save job:`, error);
                            errors++;
                        }
                        onProgress({
                            current, total: current, newCount, duplicateCount,
                            source: strategy.source,
                            status: 'スクレイピング中...'
                        });
                    }
                }
                catch (e) {
                    console.error(`Error in strategy ${strategy.source}:`, e);
                    errors++;
                    onProgress({
                        current, total: current, newCount, duplicateCount,
                        source: strategy.source,
                        status: `エラー発生: ${e.message}`
                    });
                }
                finally {
                    await page.close();
                    await context.close();
                    // スクレイピングログを記録
                    const durationMs = Date.now() - startTime;
                    this.logRepo.insert({
                        scrapeType: 'full',
                        source: strategy.source,
                        status: errors > jobsFound * 0.5 ? 'partial' : 'success',
                        jobsFound,
                        newJobs,
                        updatedJobs,
                        errors,
                        errorMessage: errors > 0 ? `${errors} errors occurred` : undefined,
                        durationMs,
                        scrapedAt: new Date().toISOString()
                    });
                }
                if (this.shouldStop)
                    break;
            }
            return { success: true };
        }
        catch (error) {
            console.error('Scraping fatal error:', error);
            return { success: false, error: error.message };
        }
        finally {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            this.isRunning = false;
        }
    }
    async stop() {
        this.shouldStop = true;
    }
    loadStrategies(sources) {
        const strategies = [];
        for (const source of sources) {
            try {
                if (source === 'mynavi') {
                    const { MynaviStrategy } = require('./strategies/mynavi');
                    strategies.push(new MynaviStrategy());
                }
                else if (source === 'rikunabi') {
                    const { RikunabiStrategy } = require('./strategies/rikunabi');
                    strategies.push(new RikunabiStrategy());
                }
                else if (source === 'doda') {
                    const { DodaStrategy } = require('./strategies/doda');
                    strategies.push(new DodaStrategy());
                }
            }
            catch (e) {
                console.error(`Failed to load strategy: ${source}`, e);
            }
        }
        return strategies;
    }
}
exports.ScrapingEngine = ScrapingEngine;
