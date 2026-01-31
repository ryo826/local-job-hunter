
import { Page } from 'playwright';

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
}

export interface ScrapingParams {
    keywords?: string;
    location?: string;
    prefectures?: string[];  // 複数の都道府県
    jobTypes?: string[];     // 複数の職種カテゴリ
}

export interface ScrapingStrategy {
    readonly source: string;
    login?(page: Page): Promise<void>;
    scrape(page: Page, params: ScrapingParams, onLog?: (message: string) => void): AsyncGenerator<CompanyData>;
}
