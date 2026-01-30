// scrapers/base/BaseScraper.ts
import { Browser, Page } from 'playwright';
import { Job } from '../../../src/shared/types/Job';
import { ScraperConfig } from './ScraperConfig';

export abstract class BaseScraper {
    protected config: ScraperConfig;
    protected browser?: Browser;
    protected page?: Page;

    constructor(config: ScraperConfig) {
        this.config = config;
    }

    // 初期化
    async initialize(): Promise<void> {
        const playwright = await import('playwright');
        this.browser = await playwright.chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        });

        const context = await this.browser.newContext({
            userAgent: this.config.userAgent,
            locale: 'ja-JP',
            timezoneId: 'Asia/Tokyo',
            viewport: { width: 1920, height: 1080 }
        });

        this.page = await context.newPage();
    }

    // クリーンアップ
    async cleanup(): Promise<void> {
        if (this.page) await this.page.close();
        if (this.browser) await this.browser.close();
    }

    // レート制限
    protected async wait(): Promise<void> {
        await new Promise(resolve =>
            setTimeout(resolve, this.config.rateLimit)
        );
    }

    // 抽象メソッド（各サイトで実装）
    abstract scrapeSearchResults(params: any): Promise<string[]>;
    abstract scrapeJobDetail(jobId: string): Promise<Job | null>;
    abstract getSearchUrl(params: any): string;

    // 共通エラーハンドリング
    protected async safeRequest<T>(
        fn: () => Promise<T>,
        retries: number = 3
    ): Promise<T | null> {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                console.error(`[${this.config.site}] Attempt ${i + 1} failed:`, error);
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1)));
                }
            }
        }
        return null;
    }

    // ランダム待機時間
    protected randomDelay(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}
