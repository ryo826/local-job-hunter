import { chromium, Browser, Page } from 'playwright';
import { companyRepository } from './database';
import { ScrapingStrategy, ScrapingParams, CompanyData } from './strategies/ScrapingStrategy';
import { JobRepository } from './repositories/JobRepository';
import { ScrapingLogRepository } from './repositories/ScrapingLogRepository';
import { UpsertService } from './services/UpsertService';
import { DataConverter } from './services/DataConverter';
import { getGoogleMapsService } from './services/GoogleMapsService';
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

export interface ScrapingProgress {
    current: number;
    total: number;
    status: string;
    source: string;
    newCount: number;
    duplicateCount: number;
    totalJobs?: number;          // 検索条件に合った総求人件数
    estimatedMinutes?: number;   // 完了までの推定時間（分）
    startTime?: number;          // スクレイピング開始時刻
}

export class ScrapingEngine {
    private browser: Browser | null = null;
    private isRunning = false;
    private shouldStop = false;
    private db: Database.Database;
    private jobRepo: JobRepository;
    private logRepo: ScrapingLogRepository;
    private upsertService: UpsertService;

    constructor() {
        // データベース接続を初期化
        const dbPath = path.join(app.getPath('userData'), 'companies.db');
        this.db = new Database(dbPath);
        this.jobRepo = new JobRepository(this.db);
        this.logRepo = new ScrapingLogRepository(this.db);
        this.upsertService = new UpsertService(this.db);
    }

    async start(
        options: { sources: string[]; keywords?: string; location?: string; prefectures?: string[]; jobTypes?: string[] },
        onProgress: (progress: ScrapingProgress) => void,
        onLog?: (message: string) => void
    ): Promise<{ success: boolean; error?: string }> {
        if (this.isRunning) {
            return { success: false, error: 'Scraping already in progress' };
        }

        this.isRunning = true;
        this.shouldStop = false;

        try {
            // Headless mode with stealth settings
            // Rikunabi NEXTのボット検出回避のため headless: "new" を使用
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials'
                ]
            });

            const strategies = this.loadStrategies(options.sources);
            const params: ScrapingParams = {
                keywords: options.keywords,
                location: options.location,
                prefectures: options.prefectures,
                jobTypes: options.jobTypes,
            };

            for (const strategy of strategies) {
                if (this.shouldStop) break;

                const startTime = Date.now();
                let jobsFound = 0;
                let newJobs = 0;
                let updatedJobs = 0;
                let errors = 0;

                const context = await this.browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    locale: 'ja-JP',
                    timezoneId: 'Asia/Tokyo',
                    viewport: { width: 1920, height: 1080 },
                    // WebGL fingerprinting回避
                    bypassCSP: true,
                    javaScriptEnabled: true,
                    ignoreHTTPSErrors: true,
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

                let newCount = 0;
                let duplicateCount = 0;
                let current = 0;
                let totalJobs: number | undefined = undefined;
                const scrapeStartTime = Date.now();

                try {
                    const log = (msg: string) => {
                        console.log(`[${strategy.source}] ${msg}`);
                        onLog?.(`[${strategy.source}] ${msg}`);
                    };

                    // 総件数コールバック - ページ読み込み後すぐに呼ばれる
                    const onTotalCount = (count: number) => {
                        totalJobs = count;
                        onProgress({
                            current: 0, total: count, newCount: 0, duplicateCount: 0,
                            source: strategy.source,
                            status: 'スクレイピング中...',
                            totalJobs: count,
                            startTime: scrapeStartTime,
                        });
                    };

                    for await (const company of strategy.scrape(page, params, { onLog: log, onTotalCount })) {
                        if (this.shouldStop) break;
                        current++;
                        jobsFound++;

                        // 会社名で重複チェック（B2B営業用：同じ会社の複数求人を1つにまとめる）
                        const existsByName = companyRepository.existsByName(company.company_name);

                        if (existsByName) {
                            duplicateCount++;
                            log(`重複スキップ: ${company.company_name}`);
                            // 進捗を更新して次へ
                            const elapsedMs = Date.now() - scrapeStartTime;
                            const avgTimePerJob = current > 0 ? elapsedMs / current : 10000;
                            const remainingJobs = totalJobs ? Math.max(0, totalJobs - current) : 0;
                            const estimatedMinutes = totalJobs
                                ? Math.ceil((remainingJobs * avgTimePerJob) / 60000)
                                : undefined;

                            onProgress({
                                current,
                                total: totalJobs ?? current,
                                newCount,
                                duplicateCount,
                                source: strategy.source,
                                status: 'スクレイピング中...',
                                totalJobs,
                                estimatedMinutes,
                                startTime: scrapeStartTime,
                            });
                            continue;
                        }

                        newCount++;

                        // 既存: CompanyDataとして保存(B2B営業用)
                        companyRepository.safeUpsert(company as any);

                        // 電話番号がない場合はGoogle Maps APIで取得
                        if (!company.phone) {
                            const googleMapsService = getGoogleMapsService();
                            if (googleMapsService) {
                                try {
                                    log(`電話番号を検索中: ${company.company_name}`);
                                    const phone = await googleMapsService.findCompanyPhone(
                                        company.company_name,
                                        company.address
                                    );
                                    if (phone) {
                                        company.phone = phone;
                                        // 会社名で検索してIDを取得し、電話番号を更新
                                        const savedCompany = companyRepository.getByName(company.company_name);
                                        if (savedCompany) {
                                            companyRepository.update(savedCompany.id, { phone });
                                        }
                                        log(`電話番号取得: ${phone}`);
                                    } else {
                                        log(`電話番号が見つかりませんでした`);
                                    }
                                } catch (phoneError) {
                                    console.error(`Phone lookup error for ${company.company_name}:`, phoneError);
                                }
                            }
                        }

                        // 新規: Job型に変換して保存(求人情報管理用)
                        try {
                            const job = DataConverter.companyDataToJob(company);
                            const isNew = this.upsertService.upsert(job);

                            if (isNew) {
                                newJobs++;
                            } else {
                                updatedJobs++;
                            }
                        } catch (error) {
                            console.error(`Failed to convert/save job:`, error);
                            errors++;
                        }

                        // 推定時間を計算（1件あたり約10秒として計算）
                        const elapsedMs = Date.now() - scrapeStartTime;
                        const avgTimePerJob = current > 0 ? elapsedMs / current : 10000;
                        const remainingJobs = totalJobs ? Math.max(0, totalJobs - current) : 0;
                        const estimatedMinutes = totalJobs
                            ? Math.ceil((remainingJobs * avgTimePerJob) / 60000)
                            : undefined;

                        onProgress({
                            current,
                            total: totalJobs ?? current,
                            newCount,
                            duplicateCount,
                            source: strategy.source,
                            status: 'スクレイピング中...',
                            totalJobs,
                            estimatedMinutes,
                            startTime: scrapeStartTime,
                        });
                    }
                } catch (e: any) {
                    console.error(`Error in strategy ${strategy.source}:`, e);
                    errors++;
                    onProgress({
                        current,
                        total: totalJobs ?? current,
                        newCount,
                        duplicateCount,
                        source: strategy.source,
                        status: `エラー発生: ${e.message}`,
                        totalJobs,
                        startTime: scrapeStartTime,
                    });
                } finally {
                    await page.close();
                    await context.close();

                    // スクレイピングログを記録
                    const durationMs = Date.now() - startTime;
                    this.logRepo.insert({
                        scrapeType: 'full',
                        source: strategy.source as 'mynavi' | 'doda' | 'rikunabi',
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

                if (this.shouldStop) break;
            }

            return { success: true };

        } catch (error: any) {
            console.error('Scraping fatal error:', error);
            return { success: false, error: error.message };
        } finally {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            this.isRunning = false;
        }
    }

    async stop(): Promise<void> {
        this.shouldStop = true;
    }

    private loadStrategies(sources: string[]): ScrapingStrategy[] {
        const strategies: ScrapingStrategy[] = [];
        for (const source of sources) {
            try {
                if (source === 'mynavi') {
                    const { MynaviStrategy } = require('./strategies/mynavi');
                    strategies.push(new MynaviStrategy());
                } else if (source === 'rikunabi') {
                    const { RikunabiStrategy } = require('./strategies/rikunabi');
                    strategies.push(new RikunabiStrategy());
                } else if (source === 'doda') {
                    const { DodaStrategy } = require('./strategies/doda');
                    strategies.push(new DodaStrategy());
                }
            } catch (e) {
                console.error(`Failed to load strategy: ${source}`, e);
            }
        }
        return strategies;
    }
}
