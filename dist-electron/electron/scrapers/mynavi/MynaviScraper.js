"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MynaviScraper = void 0;
// scrapers/mynavi/MynaviScraper.ts
const BaseScraper_1 = require("../base/BaseScraper");
const MynaviParser_1 = require("./MynaviParser");
class MynaviScraper extends BaseScraper_1.BaseScraper {
    parser;
    constructor() {
        super({
            site: 'mynavi',
            baseUrl: 'https://tenshoku.mynavi.jp',
            rateLimit: 2500,
            maxConcurrent: 1,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            timeout: 30000
        });
        this.parser = new MynaviParser_1.MynaviParser();
    }
    // 検索結果からJob IDリストを取得
    async scrapeSearchResults(params) {
        const url = this.getSearchUrl(params);
        const jobIds = [];
        if (!this.page) {
            throw new Error('Page not initialized. Call initialize() first.');
        }
        await this.page.goto(url, { waitUntil: 'networkidle', timeout: this.config.timeout });
        await this.wait();
        // 求人カードからJob IDを抽出
        const cards = await this.page.$$('section.recruit, article.recruit');
        for (const card of cards) {
            const link = await card.$('.recruit_title .txt a, a.recruit__title');
            if (link) {
                const href = await link.getAttribute('href');
                const jobId = this.extractJobId(href);
                if (jobId)
                    jobIds.push(jobId);
            }
        }
        return [...new Set(jobIds)]; // 重複除去
    }
    // 求人詳細を取得（JSON-LD優先）
    async scrapeJobDetail(jobId) {
        return this.safeRequest(async () => {
            if (!this.page) {
                throw new Error('Page not initialized');
            }
            const url = `${this.config.baseUrl}/jobinfo-${jobId}/`;
            await this.page.goto(url, { waitUntil: 'networkidle', timeout: this.config.timeout });
            await this.wait();
            const html = await this.page.content();
            // JSON-LDを抽出
            const jsonLd = await this.page.evaluate(() => {
                const script = document.querySelector('script[type="application/ld+json"]');
                if (!script)
                    return null;
                try {
                    const data = JSON.parse(script.textContent || '');
                    // 配列の場合はJobPostingを探す
                    if (Array.isArray(data)) {
                        return data.find(item => item['@type'] === 'JobPosting');
                    }
                    return data['@type'] === 'JobPosting' ? data : null;
                }
                catch {
                    return null;
                }
            });
            if (!jsonLd) {
                console.warn(`[Mynavi] JSON-LD not found for job ${jobId}`);
                return null;
            }
            // JSON-LDからJobオブジェクトを生成
            return this.parser.parseJsonLd(jobId, jsonLd, html);
        });
    }
    getSearchUrl(params) {
        const { area = 'shutoken', prefecture = 'p13', keyword, page = 1 } = params;
        let url = `${this.config.baseUrl}/${area}/list/${prefecture}/`;
        if (keyword) {
            url += `kw${encodeURIComponent(keyword)}/`;
        }
        if (page > 1) {
            url += `pg${page}/`;
        }
        return url;
    }
    extractJobId(href) {
        if (!href)
            return null;
        const match = href.match(/\/jobinfo-([^\/]+)\//);
        return match ? match[1] : null;
    }
    // ページネーション: 次のページが存在するか確認
    async hasNextPage() {
        if (!this.page)
            return false;
        const nextButton = await this.page.$('a.next:not(.disabled), a[rel="next"]:not(.disabled)');
        return nextButton !== null;
    }
}
exports.MynaviScraper = MynaviScraper;
