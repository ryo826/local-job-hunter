// scrapers/base/ScraperConfig.ts
export interface ScraperConfig {
    site: 'doda' | 'rikunabi' | 'mynavi';
    baseUrl: string;
    rateLimit: number;               // ミリ秒
    maxConcurrent: number;
    userAgent: string;
    timeout: number;                 // ミリ秒
}
