import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { companyRepository } from './database';
import { ScrapingStrategy, ScrapingParams, CompanyData, BudgetRank, JobCardInfo } from './strategies/ScrapingStrategy';
import { JobRepository } from './repositories/JobRepository';
import { ScrapingLogRepository } from './repositories/ScrapingLogRepository';
import { UpsertService } from './services/UpsertService';
import { DataConverter } from './services/DataConverter';
import { getGoogleMapsService } from './services/GoogleMapsService';
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

// 並列処理の設定
const PARALLEL_WORKERS = 5;  // 同時に処理するジョブ数
const PARALLEL_SOURCES = true;  // 複数サイトを同時にスクレイピング

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
    // 並列処理用: 複数ソースの進捗
    sourcesProgress?: {
        [source: string]: {
            current: number;
            total: number;
            newCount: number;
            duplicateCount: number;
        };
    };
}

// 給与テキストから最大年収（万円）を抽出
function parseSalary(salaryText: string | undefined | null): number | null {
    if (!salaryText) return null;
    // 様々なパターン: "400万円～600万円", "年収450万円以上", "月給25万円"など
    const yearlyMatch = salaryText.match(/(\d{3,4})万円/g);
    if (yearlyMatch) {
        // 最大の数値を取得
        const values = yearlyMatch.map(m => parseInt(m.replace('万円', '')));
        return Math.max(...values);
    }
    // 月給の場合は年換算（×12 + ボーナス2ヶ月想定）
    const monthlyMatch = salaryText.match(/月給\s*(\d+)万円/);
    if (monthlyMatch) {
        return parseInt(monthlyMatch[1]) * 14; // 月給 × 14ヶ月
    }
    return null;
}

// 従業員数テキストから数値を抽出
function parseEmployees(employeesText: string | undefined | null): number | null {
    if (!employeesText) return null;
    // "100人", "1,000名", "約500人"などのパターン
    const match = employeesText.replace(/,/g, '').match(/(\d+)/);
    if (match) {
        return parseInt(match[1]);
    }
    return null;
}

// 従業員数が範囲内かチェック（例: "50-100", "1000-"）
function matchesEmployeeRange(employees: number | null, range: string): boolean {
    if (employees === null) return false;

    const parts = range.split('-');
    const min = parseInt(parts[0]) || 0;
    const max = parts[1] ? parseInt(parts[1]) : Infinity;

    return employees >= min && employees < max;
}

interface ScrapingOptions {
    sources: string[];
    keywords?: string;
    location?: string;
    prefectures?: string[];
    jobTypes?: string[];
    rankFilter?: BudgetRank[];
    minSalary?: number;
    employeeRange?: string;  // 範囲指定（例: "50-100", "1000-"）
    maxJobUpdatedDays?: number;
}

interface SourceProgress {
    current: number;
    total: number;
    newCount: number;
    duplicateCount: number;
    status: string;
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
        options: ScrapingOptions,
        onProgress: (progress: ScrapingProgress) => void,
        onLog?: (message: string) => void
    ): Promise<{ success: boolean; error?: string }> {
        if (this.isRunning) {
            return { success: false, error: 'Scraping already in progress' };
        }

        this.isRunning = true;
        this.shouldStop = false;

        try {
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

            const scrapeStartTime = Date.now();

            if (PARALLEL_SOURCES && strategies.length > 1) {
                // 複数サイトを並列でスクレイピング
                onLog?.(`[並列モード] ${strategies.length}サイトを同時にスクレイピング開始`);

                const sourcesProgress: { [source: string]: SourceProgress } = {};
                strategies.forEach(s => {
                    sourcesProgress[s.source] = {
                        current: 0,
                        total: 0,
                        newCount: 0,
                        duplicateCount: 0,
                        status: '準備中...'
                    };
                });

                // 進捗を統合して報告
                const reportCombinedProgress = () => {
                    let totalCurrent = 0;
                    let totalTotal = 0;
                    let totalNew = 0;
                    let totalDuplicate = 0;

                    Object.values(sourcesProgress).forEach(p => {
                        totalCurrent += p.current;
                        totalTotal += p.total;
                        totalNew += p.newCount;
                        totalDuplicate += p.duplicateCount;
                    });

                    const elapsedMs = Date.now() - scrapeStartTime;
                    const avgTimePerJob = totalCurrent > 0 ? elapsedMs / totalCurrent : 5000;
                    const remainingJobs = Math.max(0, totalTotal - totalCurrent);
                    const estimatedMinutes = totalTotal > 0
                        ? Math.ceil((remainingJobs * avgTimePerJob) / 60000)
                        : undefined;

                    const activeSource = Object.entries(sourcesProgress)
                        .filter(([, p]) => p.current < p.total)
                        .map(([s]) => s)
                        .join(', ') || strategies[0].source;

                    onProgress({
                        current: totalCurrent,
                        total: totalTotal,
                        newCount: totalNew,
                        duplicateCount: totalDuplicate,
                        source: activeSource,
                        status: `並列スクレイピング中... (${Object.keys(sourcesProgress).length}サイト同時)`,
                        totalJobs: totalTotal,
                        estimatedMinutes,
                        startTime: scrapeStartTime,
                        sourcesProgress,
                    });
                };

                // 各サイトを並列で処理
                await Promise.all(strategies.map(async (strategy) => {
                    try {
                        await this.scrapeSource(
                            strategy,
                            params,
                            options,
                            (progress) => {
                                sourcesProgress[strategy.source] = {
                                    current: progress.current,
                                    total: progress.total,
                                    newCount: progress.newCount,
                                    duplicateCount: progress.duplicateCount,
                                    status: progress.status,
                                };
                                reportCombinedProgress();
                            },
                            (msg) => onLog?.(`[${strategy.source}] ${msg}`)
                        );
                    } catch (error: any) {
                        onLog?.(`[${strategy.source}] エラー: ${error.message}`);
                    }
                }));

            } else {
                // 単一サイトまたは順次処理
                for (const strategy of strategies) {
                    if (this.shouldStop) break;

                    await this.scrapeSource(
                        strategy,
                        params,
                        options,
                        onProgress,
                        (msg) => onLog?.(`[${strategy.source}] ${msg}`)
                    );
                }
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

    // 単一ソースのスクレイピング（並列ワーカー使用）
    private async scrapeSource(
        strategy: ScrapingStrategy,
        params: ScrapingParams,
        options: ScrapingOptions,
        onProgress: (progress: ScrapingProgress) => void,
        log: (msg: string) => void
    ): Promise<void> {
        if (!this.browser) return;

        const startTime = Date.now();
        let jobsFound = 0;
        let newJobs = 0;
        let updatedJobs = 0;
        let errors = 0;
        let newCount = 0;
        let duplicateCount = 0;
        let skippedCount = 0;
        let totalJobs: number | undefined = undefined;
        const scrapeStartTime = Date.now();

        // 並列スクレイピングをサポートするか確認
        const supportsParallel = typeof strategy.collectJobUrls === 'function' &&
            typeof strategy.scrapeJobDetail === 'function';

        if (supportsParallel) {
            log(`並列スクレイピングモード (${PARALLEL_WORKERS}ページ同時)`);
            await this.scrapeSourceParallel(strategy, params, options, onProgress, log);
            return;
        }

        // フォールバック: 従来の順次スクレイピング
        log('順次スクレイピングモード (フォールバック)');

        // メインコンテキストを作成
        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'ja-JP',
            timezoneId: 'Asia/Tokyo',
            viewport: { width: 1920, height: 1080 },
            bypassCSP: true,
            javaScriptEnabled: true,
            ignoreHTTPSErrors: true,
        });

        try {
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

            // 総件数コールバック
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

            // ジョブキューを作成
            const jobQueue: CompanyData[] = [];
            let scrapeComplete = false;

            // 進捗更新関数
            const updateProgress = () => {
                const elapsedMs = Date.now() - scrapeStartTime;
                const processed = newCount + duplicateCount + skippedCount;
                const avgTimePerJob = processed > 0 ? elapsedMs / processed : 3000;
                const remainingJobs = totalJobs ? Math.max(0, totalJobs - processed) : 0;
                const estimatedMinutes = totalJobs
                    ? Math.ceil((remainingJobs * avgTimePerJob) / 60000)
                    : undefined;

                onProgress({
                    current: processed,
                    total: totalJobs ?? processed,
                    newCount,
                    duplicateCount,
                    source: strategy.source,
                    status: `スクレイピング中...`,
                    totalJobs,
                    estimatedMinutes,
                    startTime: scrapeStartTime,
                });
            };

            // 会社データを処理する関数
            const processCompany = async (company: CompanyData): Promise<void> => {
                if (this.shouldStop) return;

                // ランクフィルター
                if (options.rankFilter && options.rankFilter.length > 0) {
                    if (!company.budget_rank || !options.rankFilter.includes(company.budget_rank)) {
                        log(`ランクフィルターでスキップ: ${company.company_name}`);
                        skippedCount++;
                        updateProgress();
                        return;
                    }
                }

                // 給与フィルター
                if (options.minSalary) {
                    const salary = parseSalary(company.salary_text);
                    if (salary === null || salary < options.minSalary) {
                        log(`給与フィルターでスキップ: ${company.company_name}`);
                        skippedCount++;
                        updateProgress();
                        return;
                    }
                }

                // 企業規模フィルター（範囲指定）
                if (options.employeeRange) {
                    const employees = parseEmployees(company.employees);
                    if (!matchesEmployeeRange(employees, options.employeeRange)) {
                        log(`企業規模フィルターでスキップ: ${company.company_name} (${employees ?? '不明'}人)`);
                        skippedCount++;
                        updateProgress();
                        return;
                    }
                }

                // 求人更新日フィルター
                if (options.maxJobUpdatedDays && company.job_page_updated_at) {
                    const updatedAt = new Date(company.job_page_updated_at);
                    const now = new Date();
                    const daysDiff = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff > options.maxJobUpdatedDays) {
                        log(`更新日フィルターでスキップ: ${company.company_name}`);
                        skippedCount++;
                        updateProgress();
                        return;
                    }
                }

                // 重複チェック
                const existsByName = companyRepository.existsByName(company.company_name);
                if (existsByName) {
                    duplicateCount++;
                    log(`重複スキップ: ${company.company_name}`);
                    updateProgress();
                    return;
                }

                // 保存処理
                newCount++;
                companyRepository.safeUpsert(company as any);

                // 電話番号取得（バックグラウンドで実行）
                if (!company.phone) {
                    const googleMapsService = getGoogleMapsService();
                    if (googleMapsService) {
                        googleMapsService.findCompanyPhone(company.company_name, company.address)
                            .then(phone => {
                                if (phone) {
                                    const savedCompany = companyRepository.getByName(company.company_name);
                                    if (savedCompany) {
                                        companyRepository.update(savedCompany.id, { phone });
                                    }
                                }
                            })
                            .catch(() => {});
                    }
                }

                // Job型に変換して保存
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

                updateProgress();
            };

            // 並列ワーカーを起動
            const workers: Promise<void>[] = [];
            for (let i = 0; i < PARALLEL_WORKERS; i++) {
                workers.push((async () => {
                    while (!this.shouldStop) {
                        const company = jobQueue.shift();
                        if (company) {
                            await processCompany(company);
                        } else if (scrapeComplete) {
                            break;
                        } else {
                            // キューが空の場合は少し待つ
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                })());
            }

            // スクレイピングしてキューに追加
            for await (const company of strategy.scrape(page, params, { onLog: log, onTotalCount })) {
                if (this.shouldStop) break;
                jobsFound++;
                jobQueue.push(company);

                // キューが大きくなりすぎないよう待機
                while (jobQueue.length > PARALLEL_WORKERS * 2 && !this.shouldStop) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            scrapeComplete = true;

            // 全ワーカーの完了を待つ
            await Promise.all(workers);

            await page.close();

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
    }

    // 真の並列スクレイピング（複数ブラウザページを同時使用）
    private async scrapeSourceParallel(
        strategy: ScrapingStrategy,
        params: ScrapingParams,
        options: ScrapingOptions,
        onProgress: (progress: ScrapingProgress) => void,
        log: (msg: string) => void
    ): Promise<void> {
        if (!this.browser) return;
        if (!strategy.collectJobUrls || !strategy.scrapeJobDetail) return;

        const startTime = Date.now();
        let newCount = 0;
        let duplicateCount = 0;
        let skippedCount = 0;
        let totalJobs: number | undefined = undefined;
        const scrapeStartTime = Date.now();

        // メインコンテキスト（URL収集用）
        const mainContext = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'ja-JP',
            timezoneId: 'Asia/Tokyo',
            viewport: { width: 1920, height: 1080 },
        });

        try {
            const mainPage = await mainContext.newPage();

            // Step 1: URL収集（高速）
            log('Step 1: 求人URLを収集中...');
            onProgress({
                current: 0, total: 0, newCount: 0, duplicateCount: 0,
                source: strategy.source,
                status: '求人URLを収集中...',
            });

            const onTotalCount = (count: number) => {
                totalJobs = count;
            };

            const jobUrls = await strategy.collectJobUrls(mainPage, params, { onLog: log, onTotalCount });
            log(`${jobUrls.length}件のURLを収集完了`);

            await mainPage.close();
            await mainContext.close();

            if (jobUrls.length === 0) {
                log('収集されたURLがありません');
                return;
            }

            // Step 2: 並列で詳細ページをスクレイピング
            log(`Step 2: ${PARALLEL_WORKERS}ページ並列で詳細をスクレイピング...`);

            // 進捗更新
            const updateProgress = () => {
                const elapsedMs = Date.now() - scrapeStartTime;
                const processed = newCount + duplicateCount + skippedCount;
                const avgTimePerJob = processed > 0 ? elapsedMs / processed : 2000;
                const remainingJobs = Math.max(0, jobUrls.length - processed);
                const estimatedMinutes = Math.ceil((remainingJobs * avgTimePerJob) / 60000 / PARALLEL_WORKERS);

                onProgress({
                    current: processed,
                    total: jobUrls.length,
                    newCount,
                    duplicateCount,
                    source: strategy.source,
                    status: `並列スクレイピング中... (${PARALLEL_WORKERS}ページ同時)`,
                    totalJobs: jobUrls.length,
                    estimatedMinutes,
                    startTime: scrapeStartTime,
                });
            };

            // 会社データを処理する関数
            const processCompany = async (company: CompanyData): Promise<void> => {
                // ランクフィルター
                if (options.rankFilter && options.rankFilter.length > 0) {
                    if (!company.budget_rank || !options.rankFilter.includes(company.budget_rank)) {
                        skippedCount++;
                        updateProgress();
                        return;
                    }
                }

                // 給与フィルター
                if (options.minSalary) {
                    const salary = parseSalary(company.salary_text);
                    if (salary === null || salary < options.minSalary) {
                        skippedCount++;
                        updateProgress();
                        return;
                    }
                }

                // 企業規模フィルター
                if (options.employeeRange) {
                    const employees = parseEmployees(company.employees);
                    if (!matchesEmployeeRange(employees, options.employeeRange)) {
                        skippedCount++;
                        updateProgress();
                        return;
                    }
                }

                // 重複チェック
                const existsByName = companyRepository.existsByName(company.company_name);
                if (existsByName) {
                    duplicateCount++;
                    updateProgress();
                    return;
                }

                // 保存
                newCount++;
                companyRepository.safeUpsert(company as any);

                // 電話番号取得（バックグラウンド）
                if (!company.phone) {
                    const googleMapsService = getGoogleMapsService();
                    if (googleMapsService) {
                        googleMapsService.findCompanyPhone(company.company_name, company.address)
                            .then(phone => {
                                if (phone) {
                                    const savedCompany = companyRepository.getByName(company.company_name);
                                    if (savedCompany) {
                                        companyRepository.update(savedCompany.id, { phone });
                                    }
                                }
                            })
                            .catch(() => {});
                    }
                }

                // Job型に変換して保存
                try {
                    const job = DataConverter.companyDataToJob(company);
                    this.upsertService.upsert(job);
                } catch (error) {
                    console.error(`Failed to convert/save job:`, error);
                }

                updateProgress();
            };

            // 並列ワーカー用のコンテキストとページを作成
            const workerContexts: any[] = [];
            const workerPages: any[] = [];

            for (let i = 0; i < PARALLEL_WORKERS; i++) {
                const ctx = await this.browser!.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    locale: 'ja-JP',
                    timezoneId: 'Asia/Tokyo',
                    viewport: { width: 1920, height: 1080 },
                });
                const page = await ctx.newPage();
                workerContexts.push(ctx);
                workerPages.push(page);
            }

            // ジョブキュー
            let jobIndex = 0;
            const getNextJob = () => {
                if (jobIndex >= jobUrls.length) return null;
                return jobUrls[jobIndex++];
            };

            // 並列ワーカー
            const workerPromises = workerPages.map(async (page, workerIdx) => {
                while (!this.shouldStop) {
                    const jobInfo = getNextJob();
                    if (!jobInfo) break;

                    try {
                        const company = await strategy.scrapeJobDetail!(
                            page,
                            jobInfo,
                            (msg) => log(`[W${workerIdx}] ${msg}`)
                        );

                        if (company) {
                            await processCompany(company);
                        } else {
                            skippedCount++;
                            updateProgress();
                        }
                    } catch (error: any) {
                        log(`[W${workerIdx}] Error: ${error.message}`);
                        skippedCount++;
                        updateProgress();
                    }
                }
            });

            // 全ワーカーの完了を待つ
            await Promise.all(workerPromises);

            // クリーンアップ
            for (const page of workerPages) {
                await page.close().catch(() => {});
            }
            for (const ctx of workerContexts) {
                await ctx.close().catch(() => {});
            }

            const durationMs = Date.now() - startTime;
            log(`完了: ${newCount}件新規, ${duplicateCount}件重複, ${skippedCount}件スキップ (${Math.round(durationMs / 1000)}秒)`);

            // ログ記録
            this.logRepo.insert({
                scrapeType: 'full',
                source: strategy.source as 'mynavi' | 'doda' | 'rikunabi',
                status: 'success',
                jobsFound: jobUrls.length,
                newJobs: newCount,
                updatedJobs: 0,
                errors: skippedCount,
                durationMs,
                scrapedAt: new Date().toISOString()
            });

        } catch (e: any) {
            console.error(`Parallel scraping error:`, e);
            log(`エラー: ${e.message}`);
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
