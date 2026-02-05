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
const DEFAULT_PARALLEL_WORKERS = 5;  // 同時に処理するジョブ数（デフォルト）
const PARALLEL_SOURCES = true;  // 複数サイトを同時にスクレイピング
const DEBUG_MODE = process.env.NODE_ENV === 'development';  // デバッグモード

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
    waitingConfirmation?: boolean;  // 確認待ち状態
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
interface ScrapingOptions {
    sources: string[];
    keywords?: string;
    location?: string;
    prefectures?: string[];
    jobTypes?: string[];
    rankFilter?: BudgetRank[];
    // 事前フィルター（検索URL・サイドバーで適用）
    minSalary?: number;          // 年収下限（万円）
    minEmployees?: number;       // 従業員数下限 - mynavi
    newPostsOnly?: boolean;      // 新着求人のみ - mynavi
    employeeRange?: string;      // 従業員数範囲（例: "50-100"）- doda
    // 並列処理設定
    parallelWorkers?: number;    // 同時処理ジョブ数（デフォルト: 5）
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
    // 確認待ち用
    private confirmationResolver: ((confirmed: boolean) => void) | null = null;

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
                    '--disable-site-isolation-trials',
                    '--disable-http2',  // HTTP/2プロトコルエラー対策
                ]
            });

            const strategies = this.loadStrategies(options.sources);

            // employeeRangeからminEmployeesを算出（URL検索用）
            let minEmployeesFromRange: number | undefined = options.minEmployees;
            if (!minEmployeesFromRange && options.employeeRange) {
                // employeeRange形式: "50-100", "100-300", "1000-" など
                const match = options.employeeRange.match(/^(\d+)/);
                if (match) {
                    minEmployeesFromRange = parseInt(match[1], 10);
                }
            }

            // 複数職種が選択された場合、各職種を順番にスクレイピング
            // （リクナビ等では複数職種を1つのURLで指定できないため）
            const jobTypesToScrape = options.jobTypes && options.jobTypes.length > 0
                ? options.jobTypes
                : [undefined]; // 職種指定なしの場合は1回だけ実行

            const scrapeStartTime = Date.now();

            // 並列ワーカー数を決定
            const parallelWorkers = options.parallelWorkers ?? DEFAULT_PARALLEL_WORKERS;

            if (PARALLEL_SOURCES && strategies.length > 1) {
                // 複数サイトを並列でスクレイピング
                onLog?.(`[並列モード] ${strategies.length}サイトを同時にスクレイピング (ワーカー数: ${parallelWorkers})`);
                if (jobTypesToScrape.length > 1) {
                    onLog?.(`[職種順次モード] ${jobTypesToScrape.length}職種を順番にスクレイピング`);
                }

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
                const reportCombinedProgress = (currentJobType?: string) => {
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

                    const statusText = currentJobType
                        ? `並列スクレイピング中... (${Object.keys(sourcesProgress).length}サイト同時) - 職種: ${currentJobType}`
                        : `並列スクレイピング中... (${Object.keys(sourcesProgress).length}サイト同時)`;

                    onProgress({
                        current: totalCurrent,
                        total: totalTotal,
                        newCount: totalNew,
                        duplicateCount: totalDuplicate,
                        source: activeSource,
                        status: statusText,
                        totalJobs: totalTotal,
                        estimatedMinutes,
                        startTime: scrapeStartTime,
                        sourcesProgress,
                    });
                };

                // 各職種を順番に処理
                for (let jobTypeIndex = 0; jobTypeIndex < jobTypesToScrape.length; jobTypeIndex++) {
                    if (this.shouldStop) break;

                    const currentJobType = jobTypesToScrape[jobTypeIndex];
                    if (currentJobType) {
                        onLog?.(`[職種 ${jobTypeIndex + 1}/${jobTypesToScrape.length}] ${currentJobType} のスクレイピング開始`);
                    }

                    // この職種用のパラメータを作成
                    const params: ScrapingParams = {
                        keywords: options.keywords,
                        location: options.location,
                        prefectures: options.prefectures,
                        jobTypes: currentJobType ? [currentJobType] : undefined,
                        minSalary: options.minSalary,
                        minEmployees: minEmployeesFromRange,
                        newPostsOnly: options.newPostsOnly,
                        employeeRange: options.employeeRange,  // 従業員数範囲（事前フィルター）
                        rankFilter: options.rankFilter,  // ランクフィルター（URL収集の最適化用）
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
                                    reportCombinedProgress(currentJobType);
                                },
                                (msg) => onLog?.(`[${strategy.source}] ${msg}`)
                            );
                        } catch (error: any) {
                            onLog?.(`[${strategy.source}] エラー: ${error.message}`);
                        }
                    }));

                    if (currentJobType) {
                        onLog?.(`[職種 ${jobTypeIndex + 1}/${jobTypesToScrape.length}] ${currentJobType} のスクレイピング完了`);
                    }
                }

            } else {
                // 単一サイトまたは順次処理
                for (const strategy of strategies) {
                    if (this.shouldStop) break;

                    // 各職種を順番に処理
                    for (let jobTypeIndex = 0; jobTypeIndex < jobTypesToScrape.length; jobTypeIndex++) {
                        if (this.shouldStop) break;

                        const currentJobType = jobTypesToScrape[jobTypeIndex];
                        if (currentJobType && jobTypesToScrape.length > 1) {
                            onLog?.(`[${strategy.source}] [職種 ${jobTypeIndex + 1}/${jobTypesToScrape.length}] ${currentJobType} のスクレイピング開始`);
                        }

                        // この職種用のパラメータを作成
                        const params: ScrapingParams = {
                            keywords: options.keywords,
                            location: options.location,
                            prefectures: options.prefectures,
                            jobTypes: currentJobType ? [currentJobType] : undefined,
                            minSalary: options.minSalary,
                            minEmployees: minEmployeesFromRange,
                            newPostsOnly: options.newPostsOnly,
                            employeeRange: options.employeeRange,  // 従業員数範囲（事前フィルター）
                            rankFilter: options.rankFilter,  // ランクフィルター（URL収集の最適化用）
                        };

                        await this.scrapeSource(
                            strategy,
                            params,
                            options,
                            onProgress,
                            (msg) => onLog?.(`[${strategy.source}] ${msg}`)
                        );

                        if (currentJobType && jobTypesToScrape.length > 1) {
                            onLog?.(`[${strategy.source}] [職種 ${jobTypeIndex + 1}/${jobTypesToScrape.length}] ${currentJobType} のスクレイピング完了`);
                        }
                    }
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
        const hasCollectJobUrls = typeof strategy.collectJobUrls === 'function';
        const hasScrapeJobDetail = typeof strategy.scrapeJobDetail === 'function';
        const supportsParallel = hasCollectJobUrls && hasScrapeJobDetail;

        // デバッグモード時のみ診断情報を出力
        if (DEBUG_MODE) {
            log(`[DEBUG] 並列モード: ${supportsParallel ? '有効' : '無効'} (source: ${strategy.source})`);
        }

        const parallelWorkers = options.parallelWorkers ?? DEFAULT_PARALLEL_WORKERS;

        if (supportsParallel) {
            log(`並列スクレイピングモード開始 (${parallelWorkers}ページ同時)`);
            try {
                await this.scrapeSourceParallel(strategy, params, options, onProgress, log, parallelWorkers);
                log(`並列スクレイピング完了`);
                return;
            } catch (parallelError: any) {
                log(`並列モードでエラー発生: ${parallelError.message}`);
                if (DEBUG_MODE) {
                    log(`エラースタック: ${parallelError.stack}`);
                }
                log(`順次モードにフォールバック`);
            }
        } else if (DEBUG_MODE) {
            log(`[DEBUG] 並列モード無効 - 順次モードで実行`);
        }

        // フォールバック: 従来の順次スクレイピング
        log('順次スクレイピングモード開始');

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
            // ※フィルターは事前（検索条件・サイドバー）で適用済み
            const processCompany = async (company: CompanyData): Promise<void> => {
                if (this.shouldStop) return;

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
            for (let i = 0; i < parallelWorkers; i++) {
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
                // 検索条件の職種を設定
                if (params.jobTypes && params.jobTypes.length > 0) {
                    company.job_type = params.jobTypes[0];
                }
                jobQueue.push(company);

                // キューが大きくなりすぎないよう待機
                while (jobQueue.length > parallelWorkers * 2 && !this.shouldStop) {
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
            const processed = newCount + duplicateCount + skippedCount;
            onProgress({
                current: processed,
                total: totalJobs ?? processed,
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
        log: (msg: string) => void,
        parallelWorkers: number = DEFAULT_PARALLEL_WORKERS
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
            ignoreHTTPSErrors: true,
            bypassCSP: true,
        });

        try {
            const mainPage = await mainContext.newPage();

            // Step 0: 検索結果の総件数を取得（URL収集前）
            log('検索結果の件数を確認中...');
            onProgress({
                current: 0, total: 0, newCount: 0, duplicateCount: 0,
                source: strategy.source,
                status: '検索結果の件数を確認中...',
            });

            // 総件数を取得
            if (strategy.getTotalJobCount) {
                totalJobs = await strategy.getTotalJobCount(mainPage, params);
                if (totalJobs !== undefined) {
                    log(`検索結果: ${totalJobs.toLocaleString()}件`);
                }
            }

            // 0件の場合は早期終了
            if (totalJobs === 0) {
                log('該当する求人が0件のため、スクレイピングを終了します');
                await mainPage.close();
                await mainContext.close();
                return;
            }

            // ★ 確認ステップ1: 検索結果の総件数を確認
            log(`確認待ち: ${totalJobs?.toLocaleString() ?? '不明'}件の検索結果があります。URL収集を開始しますか？`);
            onProgress({
                current: 0,
                total: 0,
                newCount: 0,
                duplicateCount: 0,
                source: strategy.source,
                status: `${totalJobs?.toLocaleString() ?? '不明'}件の検索結果。URL収集を開始しますか？`,
                totalJobs: totalJobs,
                waitingConfirmation: true,
            });

            // 確認待ち
            const confirmedFirst = await new Promise<boolean>((resolve) => {
                this.confirmationResolver = resolve;
            });

            if (!confirmedFirst || this.shouldStop) {
                log('ユーザーによりキャンセルされました');
                await mainPage.close();
                await mainContext.close();
                return;
            }

            log('確認OK、URL収集を開始します');

            // Step 1: URL収集
            log('Step 1: 求人URLを収集中...');
            onProgress({
                current: 0, total: 0, newCount: 0, duplicateCount: 0,
                source: strategy.source,
                status: '求人URLを収集中...',
                totalJobs: totalJobs,
            });

            let jobUrls = await strategy.collectJobUrls(mainPage, params, { onLog: log });
            log(`${jobUrls.length}件のURLを収集完了`);

            await mainPage.close();
            await mainContext.close();

            if (jobUrls.length === 0) {
                log('収集されたURLがありません');
                return;
            }

            // ★ ランクフィルターを詳細ページ訪問前に適用（最適化）
            if (options.rankFilter && options.rankFilter.length > 0) {
                const beforeCount = jobUrls.length;
                jobUrls = jobUrls.filter(job => job.rank && options.rankFilter!.includes(job.rank));
                const filteredCount = beforeCount - jobUrls.length;
                if (filteredCount > 0) {
                    log(`ランクフィルター適用: ${filteredCount}件スキップ (対象ランク: ${options.rankFilter.join(', ')})`);
                    skippedCount += filteredCount;
                }
                if (jobUrls.length === 0) {
                    log('フィルター適用後、対象の求人がありません');
                    return;
                }
                log(`フィルター後: ${jobUrls.length}件の詳細ページを訪問`);
            }

            // ★ 確認ステップ2: URL収集後、詳細取得前に確認
            log(`確認待ち: ${jobUrls.length}件の詳細を取得しますか？`);
            onProgress({
                current: 0,
                total: jobUrls.length,
                newCount: 0,
                duplicateCount: 0,
                source: strategy.source,
                status: `${jobUrls.length}件の詳細を取得しますか？`,
                totalJobs: totalJobs ?? jobUrls.length,
                waitingConfirmation: true,
            });

            // 確認待ち
            const confirmed = await new Promise<boolean>((resolve) => {
                this.confirmationResolver = resolve;
            });

            if (!confirmed || this.shouldStop) {
                log('ユーザーによりキャンセルされました');
                return;
            }

            log('確認OK、スクレイピングを続行します');

            // Step 2: 並列で詳細ページをスクレイピング
            log(`Step 2: ${parallelWorkers}ページ並列で詳細をスクレイピング...`);

            // 進捗更新
            const updateProgress = () => {
                const elapsedMs = Date.now() - scrapeStartTime;
                const processed = newCount + duplicateCount + skippedCount;
                const avgTimePerJob = processed > 0 ? elapsedMs / processed : 2000;
                const remainingJobs = Math.max(0, jobUrls.length - processed);
                const estimatedMinutes = Math.ceil((remainingJobs * avgTimePerJob) / 60000 / parallelWorkers);

                onProgress({
                    current: processed,
                    total: jobUrls.length,
                    newCount,
                    duplicateCount,
                    source: strategy.source,
                    status: `並列スクレイピング中... (${parallelWorkers}ページ同時)`,
                    totalJobs: totalJobs ?? jobUrls.length,  // 検索結果の総件数（フィルター前）
                    estimatedMinutes,
                    startTime: scrapeStartTime,
                });
            };

            // 会社データを処理する関数
            // ※フィルターは事前（検索条件・サイドバー）で適用済み
            const processCompany = async (company: CompanyData): Promise<void> => {
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
            const workerContexts: BrowserContext[] = [];
            const workerPages: Page[] = [];

            for (let i = 0; i < parallelWorkers; i++) {
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
                            // 検索条件の職種を設定
                            if (params.jobTypes && params.jobTypes.length > 0) {
                                company.job_type = params.jobTypes[0];
                            }
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
        // 確認待ちの場合はキャンセル
        if (this.confirmationResolver) {
            this.confirmationResolver(false);
            this.confirmationResolver = null;
        }
    }

    // 確認ステップで続行を指示
    confirm(proceed: boolean): void {
        if (this.confirmationResolver) {
            this.confirmationResolver(proceed);
            this.confirmationResolver = null;
        }
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
