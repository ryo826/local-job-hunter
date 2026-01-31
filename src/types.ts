
export interface Company {
    id: number;
    company_name: string;
    source: string;
    url: string;
    homepage_url: string | null;
    status: string;
    industry: string | null;
    area: string | null;
    job_title: string | null;
    salary_text: string | null;
    representative: string | null;
    establishment: string | null;
    employees: string | null;
    revenue: string | null;
    phone: string | null;
    email: string | null;
    contact_form_url: string | null;
    address: string | null;
    ai_summary: string | null;
    ai_tags: string | null;
    note: string | null;
    last_seen_at: string | null;
    created_at: string;
}

export type CompanyFilters = {
    search?: string;
    status?: string;
    source?: string;
    area?: string;
    jobTitle?: string;
};

export interface ScrapingOptions {
    sources: string[];
    keywords?: string;
    location?: string;
    prefectures?: string[];  // 複数の都道府県
    jobTypes?: string[];     // 複数の職種カテゴリ
}

export interface ScrapingProgress {
    total: number;
    current: number;
    newCount: number;
    duplicateCount: number;
    source: string;
    status: string;
}

// 新規: Job型とJobFilters型をエクスポート
export type { Job, Location } from './shared/types/Job';
export type { JobFilters, ScrapingLog, NgKeyword } from './shared/types/ScrapingLog';

export interface IElectronAPI {
    db: {
        getCompanies: (filters: CompanyFilters) => Promise<Company[]>;
        getCompany: (id: number) => Promise<Company | null>;
        updateCompany: (id: number, updates: Partial<Company>) => Promise<void>;
        exportCsv: (options?: { ids?: number[] }) => Promise<{ success: boolean; error?: string; path?: string }>;
    };
    ai: {
        analyze: (id: number) => Promise<{ success: boolean; data?: { summary: string; tags: string[] }; error?: string }>;
    };
    scraper: {
        start: (options: ScrapingOptions) => Promise<{ success: boolean; error?: string }>;
        stop: () => Promise<void>;
        onProgress: (callback: (progress: ScrapingProgress) => void) => void;
        offProgress: () => void;
        onLog: (callback: (message: string) => void) => void;
        offLog: () => void;
    };
    enrich: {
        startPhoneLookup: () => Promise<{ success: boolean; error?: string; updated?: number; total?: number }>;
        getStats: () => Promise<{ total: number; withPhone: number; withoutPhone: number }>;
        onProgress: (callback: (progress: { current: number; total: number; companyName: string }) => void) => void;
        offProgress: () => void;
        onLog: (callback: (message: string) => void) => void;
        offLog: () => void;
    };
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}

