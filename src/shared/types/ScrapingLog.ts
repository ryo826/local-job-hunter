// スクレイピングログの型定義
export interface ScrapingLog {
    id?: number;
    scrapeType: 'search' | 'detail' | 'company' | 'full';
    source: 'mynavi' | 'doda' | 'rikunabi';
    targetUrl?: string;
    status: 'success' | 'error' | 'partial';
    jobsFound: number;
    newJobs: number;
    updatedJobs: number;
    errors: number;
    errorMessage?: string;
    durationMs: number;              // 実行時間（ミリ秒）
    scrapedAt: string;               // ISO 8601形式
}

// NGキーワードの型定義
export interface NgKeyword {
    id?: number;
    keyword: string;
    category: 'company' | 'title' | 'description';
    isRegex: boolean;
    createdAt: string;               // ISO 8601形式
}

// 求人フィルターの型定義
export interface JobFilters {
    search?: string;
    source?: 'mynavi' | 'doda' | 'rikunabi' | 'all';
    salaryMin?: number;
    salaryMax?: number;
    location?: string;
    isActive?: boolean;
}
