
// ランク定義
export type BudgetRank = 'A' | 'B' | 'C';

export const RANK_DEFINITIONS = {
    A: {
        label: '高予算層',
        description: 'プレミアム枠・PR枠・Job Flair等の有料オプション使用',
        confidence: 0.9
    },
    B: {
        label: '中予算層',
        description: '1ページ目表示(上位30〜100件)',
        confidence: 0.7
    },
    C: {
        label: '低予算層',
        description: '2ページ目以降または下位表示',
        confidence: 0.6
    }
} as const;

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
    // ランク関連フィールド
    budget_rank: BudgetRank | null;
    rank_confidence: number | null;
    rank_detected_at: string | null;
    // 更新機能関連フィールド
    last_updated_at: string | null;
    update_count: number;
    last_rank: BudgetRank | null;
    rank_changed_at: string | null;
    job_count: number;
    latest_job_title: string | null;
    listing_status: '掲載中' | '掲載終了';
    // 求人ページ更新日関連フィールド
    job_page_updated_at: string | null;  // 求人ページの最終更新日
    job_page_end_date: string | null;    // 掲載終了予定日
    job_page_start_date: string | null;  // 掲載開始日(doda)
}

export type CompanyFilters = {
    search?: string;
    status?: string;
};

export interface ScrapingOptions {
    sources: string[];
    keywords?: string;
    location?: string;
    prefectures?: string[];  // 複数の都道府県
    jobTypes?: string[];     // 複数の職種カテゴリ
    rankFilter?: BudgetRank[];  // 保存対象のランク（空配列または未指定で全て保存）
}

export interface ScrapingProgress {
    total: number;
    current: number;
    newCount: number;
    duplicateCount: number;
    source: string;
    status: string;
    totalJobs?: number;          // 検索条件に合った総求人件数
    estimatedMinutes?: number;   // 完了までの推定時間（分）
    startTime?: number;          // スクレイピング開始時刻
}

// 更新機能関連の型定義
export interface UpdateProgress {
    current: number;
    total: number;
    companyName: string;
    status: string;
    startTime?: number;
}

export interface UpdateChanges {
    rank?: { old: BudgetRank | null; new: BudgetRank | null; direction?: 'upgrade' | 'downgrade' };
    jobCount?: { old: number; new: number; delta: number };
    status?: { old: string; new: string };
}

export interface UpdateResult {
    companyId: number;
    companyName: string;
    changes: UpdateChanges;
    updatedAt: string;
    error?: string;
}

// 新規: Job型とJobFilters型をエクスポート
export type { Job, Location } from './shared/types/Job';
export type { JobFilters, ScrapingLog, NgKeyword } from './shared/types/ScrapingLog';

export interface IElectronAPI {
    db: {
        getCompanies: (filters: CompanyFilters) => Promise<Company[]>;
        getCompany: (id: number) => Promise<Company | null>;
        updateCompany: (id: number, updates: Partial<Company>) => Promise<void>;
        deleteCompanies: (ids: number[]) => Promise<{ success: boolean; deleted?: number; error?: string }>;
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
    update: {
        startUpdate: (companyIds?: number[]) => Promise<{ success: boolean; error?: string; results?: UpdateResult[] }>;
        stop: () => Promise<void>;
        onProgress: (callback: (progress: UpdateProgress) => void) => void;
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

