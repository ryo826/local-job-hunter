"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapingEngine = void 0;
const playwright_1 = require("playwright");
const database_1 = require("./database");
const SMART_STOP_THRESHOLD = 50;
const TIMEOUT_MS = 60 * 60 * 1000; // 60 min
class ScrapingEngine {
    browser = null;
    isRunning = false;
    shouldStop = false;
    // No need to inject db, use repository
    constructor() { }
    async start(options, onProgress, onLog) {
        if (this.isRunning) {
            return { success: false, error: 'Scraping already in progress' };
        }
        this.isRunning = true;
        this.shouldStop = false;
        try {
            // Headful mode for B Rollar (Headless: false)
            this.browser = await playwright_1.chromium.launch({ headless: false });
            const strategies = this.loadStrategies(options.sources);
            const params = {
                keywords: options.keywords,
                location: options.location,
            };
            for (const strategy of strategies) {
                if (this.shouldStop)
                    break;
                const context = await this.browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
                        // Safe Upsert
                        // Convert CompanyData to Partial<Company> match (Types mismatch handling if needed)
                        // Note: database.ts safeUpsert maps internally.
                        database_1.companyRepository.safeUpsert(company);
                        onProgress({
                            current, total: current, newCount, duplicateCount,
                            source: strategy.source,
                            status: 'スクレイピング中...'
                        });
                    }
                }
                catch (e) {
                    console.error(`Error in strategy ${strategy.source}:`, e);
                    onProgress({
                        current, total: current, newCount, duplicateCount,
                        source: strategy.source,
                        status: `エラー発生: ${e.message}`
                    });
                }
                finally {
                    await page.close();
                    await context.close();
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
