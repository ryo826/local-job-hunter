import { chromium, Browser, Page, Locator } from 'playwright';
import { companyRepository } from './database';
import type { Company, BudgetRank, UpdateProgress, UpdateResult, UpdateChanges } from '../src/types';
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

// ランダム待機時間
function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// スクレイピング結果
interface JobListing {
    title: string;
    company: string;
    rank: BudgetRank;
    url: string;
    source: string;
}

interface ScrapingResult {
    jobs: JobListing[];
    rank: BudgetRank | null;
    jobCount: number;
    sources: {
        mynavi: number;
        doda: number;
        rikunabi: number;
    };
}

export class UpdateEngine {
    private browser: Browser | null = null;
    private isRunning = false;
    private shouldStop = false;
    private db: Database.Database;

    constructor() {
        const dbPath = path.join(app.getPath('userData'), 'companies.db');
        this.db = new Database(dbPath);
    }

    async start(
        companyIds: number[] | undefined,
        onProgress: (progress: UpdateProgress) => void,
        onLog?: (message: string) => void
    ): Promise<{ success: boolean; error?: string; results?: UpdateResult[] }> {
        if (this.isRunning) {
            return { success: false, error: 'Update already in progress' };
        }

        this.isRunning = true;
        this.shouldStop = false;

        const log = (msg: string) => {
            console.log(`[Update] ${msg}`);
            onLog?.(`[Update] ${msg}`);
        };

        try {
            // ブラウザ起動
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ]
            });

            // 対象会社リストを取得
            let companies: Company[];
            if (companyIds && companyIds.length > 0) {
                companies = companyIds
                    .map(id => companyRepository.getById(id))
                    .filter((c): c is Company => c !== null);
            } else {
                companies = companyRepository.getAll({});
            }

            log(`更新対象: ${companies.length}社`);

            const results: UpdateResult[] = [];
            const startTime = Date.now();

            for (let i = 0; i < companies.length; i++) {
                if (this.shouldStop) {
                    log('更新を中止しました');
                    break;
                }

                const company = companies[i];
                onProgress({
                    current: i + 1,
                    total: companies.length,
                    companyName: company.company_name,
                    status: `${company.company_name} を更新中...`,
                    startTime,
                });

                try {
                    const result = await this.updateSingleCompany(company, log);
                    results.push(result);

                    // 変更があった場合はログ出力
                    if (Object.keys(result.changes).length > 0) {
                        log(`変更検出: ${company.company_name}`);
                        if (result.changes.rank) {
                            log(`  ランク: ${result.changes.rank.old} → ${result.changes.rank.new}`);
                        }
                        if (result.changes.jobCount) {
                            log(`  求人数: ${result.changes.jobCount.old} → ${result.changes.jobCount.new}`);
                        }
                        if (result.changes.status) {
                            log(`  ステータス: ${result.changes.status.old} → ${result.changes.status.new}`);
                        }
                    }

                } catch (error: any) {
                    log(`エラー (${company.company_name}): ${error.message}`);
                    results.push({
                        companyId: company.id,
                        companyName: company.company_name,
                        changes: {},
                        updatedAt: new Date().toISOString(),
                        error: error.message,
                    });
                }

                // レート制限（3秒間隔）
                if (i < companies.length - 1) {
                    await sleep(3000);
                }
            }

            log(`更新完了: ${results.length}社`);
            return { success: true, results };

        } catch (error: any) {
            log(`致命的エラー: ${error.message}`);
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

    private async updateSingleCompany(
        company: Company,
        log: (msg: string) => void
    ): Promise<UpdateResult> {
        if (!this.browser) {
            throw new Error('Browser not initialized');
        }

        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale: 'ja-JP',
            timezoneId: 'Asia/Tokyo',
            viewport: { width: 1920, height: 1080 },
        });

        try {
            const page = await context.newPage();

            // 各サイトで並列検索
            const [mynaviJobs, dodaJobs, rikunabiJobs] = await Promise.all([
                this.scrapeMynaviForCompany(page, company.company_name, log).catch(() => []),
                this.scrapeDodaForCompany(page, company.company_name, log).catch(() => []),
                this.scrapeRikunabiForCompany(page, company.company_name, log).catch(() => []),
            ]);

            await page.close();

            // 結果を集約
            const aggregated = this.aggregateResults(mynaviJobs, dodaJobs, rikunabiJobs);

            // 変更検出
            const changes = this.detectChanges(company, aggregated);

            // データベース更新
            await this.updateDatabase(company.id, aggregated, changes);

            return {
                companyId: company.id,
                companyName: company.company_name,
                changes,
                updatedAt: new Date().toISOString(),
            };

        } finally {
            await context.close();
        }
    }

    // マイナビで会社名検索
    private async scrapeMynaviForCompany(
        page: Page,
        companyName: string,
        log: (msg: string) => void
    ): Promise<JobListing[]> {
        const searchUrl = `https://tenshoku.mynavi.jp/list/kw${encodeURIComponent(companyName)}/`;
        log(`[Mynavi] 検索: ${companyName}`);

        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(randomDelay(2000, 4000));

            const jobs: JobListing[] = [];
            const cards = await page.locator('.cassetteRecruitRecommend, .recruitList__item, .recruit').all();

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const cardCompanyName = await card.locator('.cassetteRecruitRecommend__name, .recruit_company_name, .recruit_company').first().textContent();

                // 会社名の部分一致チェック
                if (cardCompanyName && this.isCompanyMatch(cardCompanyName.trim(), companyName)) {
                    const title = await card.locator('.cassetteRecruitRecommend__copy, .recruit_job_title, .recruit_title').first().textContent();
                    const linkEl = card.locator('a[href*="/jobinfo"]').first();
                    const url = await linkEl.getAttribute('href');

                    // ランク判定
                    const rank = await this.classifyMynaviCard(card, 1);

                    jobs.push({
                        title: title?.trim() || '',
                        company: cardCompanyName.trim(),
                        rank,
                        url: url || '',
                        source: 'mynavi',
                    });
                }
            }

            log(`[Mynavi] ${jobs.length}件の求人を検出`);
            return jobs;

        } catch (error: any) {
            log(`[Mynavi] エラー: ${error.message}`);
            return [];
        }
    }

    // dodaで会社名検索
    private async scrapeDodaForCompany(
        page: Page,
        companyName: string,
        log: (msg: string) => void
    ): Promise<JobListing[]> {
        const searchUrl = `https://doda.jp/DodaFront/View/JobSearchList/j_kw__${encodeURIComponent(companyName)}/`;
        log(`[doda] 検索: ${companyName}`);

        try {
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(randomDelay(2000, 4000));

            const jobs: JobListing[] = [];
            const cards = await page.locator('.jobCard-card').all();

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const cardCompanyName = await card.locator('.jobCard-header__company').first().textContent();

                if (cardCompanyName && this.isCompanyMatch(cardCompanyName.trim(), companyName)) {
                    const title = await card.locator('.jobCard-header__title').first().textContent();
                    const linkEl = card.locator('a.jobCard-header__link').first();
                    const url = await linkEl.getAttribute('href');

                    // ランク判定
                    const rank = await this.classifyDodaCard(card, i);

                    jobs.push({
                        title: title?.trim() || '',
                        company: cardCompanyName.trim(),
                        rank,
                        url: url || '',
                        source: 'doda',
                    });
                }
            }

            log(`[doda] ${jobs.length}件の求人を検出`);
            return jobs;

        } catch (error: any) {
            log(`[doda] エラー: ${error.message}`);
            return [];
        }
    }

    // リクナビNEXTで会社名検索
    private async scrapeRikunabiForCompany(
        page: Page,
        companyName: string,
        log: (msg: string) => void
    ): Promise<JobListing[]> {
        const searchUrl = `https://next.rikunabi.com/job_search/?kw=${encodeURIComponent(companyName)}`;
        log(`[Rikunabi] 検索: ${companyName}`);

        try {
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(randomDelay(3000, 5000));

            const jobs: JobListing[] = [];
            const cards = await page.locator('a[class*="styles_bigCard"]').all();

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const cardCompanyName = await card.locator('[class*="styles_companyName"]').first().textContent();

                if (cardCompanyName && this.isCompanyMatch(cardCompanyName.trim(), companyName)) {
                    const title = await card.locator('[class*="styles_title"]').first().textContent();
                    const url = await card.getAttribute('href');

                    // ランク判定
                    const rank = await this.classifyRikunabiCard(card, i, 1);

                    jobs.push({
                        title: title?.trim() || '',
                        company: cardCompanyName.trim(),
                        rank,
                        url: url || '',
                        source: 'rikunabi',
                    });
                }
            }

            log(`[Rikunabi] ${jobs.length}件の求人を検出`);
            return jobs;

        } catch (error: any) {
            log(`[Rikunabi] エラー: ${error.message}`);
            return [];
        }
    }

    // 会社名の一致チェック（部分一致）
    private isCompanyMatch(cardName: string, searchName: string): boolean {
        const normalize = (s: string) => s
            .replace(/株式会社|有限会社|合同会社|（株）|\(株\)|㈱/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();

        const normalizedCard = normalize(cardName);
        const normalizedSearch = normalize(searchName);

        return normalizedCard.includes(normalizedSearch) || normalizedSearch.includes(normalizedCard);
    }

    // マイナビのランク判定
    private async classifyMynaviCard(card: Locator, pageNum: number): Promise<BudgetRank> {
        try {
            const dataTy = await card.getAttribute('data-ty');
            const hasAttentionLabel = await card.locator('.cassetteRecruitRecommend__label--attention').count() > 0;

            if (dataTy === 'rzs' || hasAttentionLabel) {
                return 'A';
            } else if (pageNum === 1) {
                return 'B';
            } else {
                return 'C';
            }
        } catch {
            return 'C';
        }
    }

    // dodaのランク判定
    private async classifyDodaCard(card: Locator, displayIndex: number): Promise<BudgetRank> {
        try {
            const linkEl = card.locator('a.jobCard-header__link').first();
            const href = await linkEl.getAttribute('href');
            const isPR = href?.includes('-tab__pr/') ?? false;

            if (isPR) {
                return 'A';
            } else if (displayIndex < 20) {
                return 'B';
            } else {
                return 'C';
            }
        } catch {
            return 'C';
        }
    }

    // リクナビのランク判定
    private async classifyRikunabiCard(card: Locator, displayIndex: number, pageNum: number): Promise<BudgetRank> {
        try {
            const hasJobFlair = await card.locator('[class*="flair"], [class*="premium"], [class*="sponsored"]').count() > 0;
            const absoluteIndex = (pageNum - 1) * 100 + displayIndex;

            if (hasJobFlair) {
                return 'A';
            } else if (absoluteIndex < 100) {
                return 'B';
            } else {
                return 'C';
            }
        } catch {
            return 'C';
        }
    }

    // 結果集約
    private aggregateResults(
        mynaviJobs: JobListing[],
        dodaJobs: JobListing[],
        rikunabiJobs: JobListing[]
    ): ScrapingResult {
        const allJobs = [...mynaviJobs, ...dodaJobs, ...rikunabiJobs];

        // 最高ランクを採用
        const ranks = allJobs.map(j => j.rank);
        let bestRank: BudgetRank | null = null;
        if (ranks.includes('A')) {
            bestRank = 'A';
        } else if (ranks.includes('B')) {
            bestRank = 'B';
        } else if (ranks.length > 0) {
            bestRank = 'C';
        }

        return {
            jobs: allJobs,
            rank: bestRank,
            jobCount: allJobs.length,
            sources: {
                mynavi: mynaviJobs.length,
                doda: dodaJobs.length,
                rikunabi: rikunabiJobs.length,
            },
        };
    }

    // 変更検出
    private detectChanges(company: Company, newData: ScrapingResult): UpdateChanges {
        const changes: UpdateChanges = {};

        // ランク変動検出
        if (company.budget_rank !== newData.rank && newData.rank !== null) {
            const rankOrder: Record<BudgetRank, number> = { 'A': 3, 'B': 2, 'C': 1 };
            const oldRankValue = company.budget_rank ? rankOrder[company.budget_rank] : 0;
            const newRankValue = rankOrder[newData.rank];

            changes.rank = {
                old: company.budget_rank,
                new: newData.rank,
                direction: newRankValue > oldRankValue ? 'upgrade' : 'downgrade',
            };
        }

        // 求人数変化検出
        const oldJobCount = company.job_count || 0;
        const newJobCount = newData.jobCount;

        if (newJobCount !== oldJobCount) {
            changes.jobCount = {
                old: oldJobCount,
                new: newJobCount,
                delta: newJobCount - oldJobCount,
            };
        }

        // 掲載ステータス変化
        const isCurrentlyActive = newJobCount > 0;
        const wasActive = company.listing_status === '掲載中';

        if (isCurrentlyActive !== wasActive) {
            changes.status = {
                old: wasActive ? '掲載中' : '掲載終了',
                new: isCurrentlyActive ? '掲載中' : '掲載終了',
            };
        }

        return changes;
    }

    // データベース更新
    private async updateDatabase(
        companyId: number,
        newData: ScrapingResult,
        changes: UpdateChanges
    ): Promise<void> {
        const updates: string[] = [];
        const params: any[] = [];

        // 基本情報更新
        updates.push('last_updated_at = ?');
        params.push(new Date().toISOString());

        updates.push('update_count = update_count + 1');

        // ランク更新
        if (changes.rank && changes.rank.new) {
            updates.push('last_rank = budget_rank');
            updates.push('budget_rank = ?');
            params.push(changes.rank.new);
            updates.push('rank_changed_at = ?');
            params.push(new Date().toISOString());
        }

        // 求人数更新
        updates.push('job_count = ?');
        params.push(newData.jobCount);

        // ステータス更新
        if (changes.status) {
            updates.push('listing_status = ?');
            params.push(changes.status.new);
        }

        // 最新求人タイトル
        if (newData.jobs.length > 0) {
            updates.push('latest_job_title = ?');
            params.push(newData.jobs[0].title);
        }

        params.push(companyId);

        this.db.prepare(
            `UPDATE companies SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(...params);
    }
}
