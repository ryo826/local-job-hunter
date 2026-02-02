
import { Page } from 'playwright';

// ランク型定義
export type BudgetRank = 'A' | 'B' | 'C';

export interface CompanyData {
    company_name: string;
    url: string;
    source: string;
    homepage_url?: string;
    industry?: string;
    area?: string;
    job_title?: string;
    job_description?: string;
    salary_text?: string;
    representative?: string;
    establishment?: string;
    employees?: string;
    revenue?: string;
    phone?: string;
    email?: string;
    contact_form_url?: string;
    contact_page_url?: string;
    address?: string;
    scrape_status?: 'pending' | 'step1_completed' | 'step2_completed' | 'failed';
    error_message?: string;
    // ランク関連フィールド
    budget_rank?: BudgetRank;
    rank_confidence?: number;
}

export interface ScrapingParams {
    keywords?: string;
    location?: string;
    prefectures?: string[];  // 複数の都道府県
    jobTypes?: string[];     // 複数の職種カテゴリ
}

export interface ScrapingCallbacks {
    onLog?: (message: string) => void;
    onTotalCount?: (count: number) => void;  // 総件数を報告するコールバック
}

export interface ScrapingStrategy {
    readonly source: string;
    login?(page: Page): Promise<void>;
    scrape(page: Page, params: ScrapingParams, callbacks?: ScrapingCallbacks): AsyncGenerator<CompanyData>;
    getTotalJobCount?(page: Page, params: ScrapingParams): Promise<number | undefined>;
}
