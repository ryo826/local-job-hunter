// shared/types/Job.ts
export interface Job {
    // 統合ID（サイト + Job ID）
    id: string;                      // "doda_3014345383" | "rikunabi_jk9b4..." | "mynavi_99359-1-160-1"

    // メタデータ
    source: 'doda' | 'rikunabi' | 'mynavi';
    sourceJobId: string;             // 各サイト固有のID
    sourceUrl: string;               // 求人詳細URL

    // 企業情報
    companyName: string;
    companyUrl?: string;
    companyLogo?: string;

    // 求人基本情報
    title: string;
    employmentType: string;          // 正社員、契約社員、派遣など
    industry?: string;

    // 詳細情報
    description: string;             // HTML形式
    requirements?: string;
    benefits?: string;
    workHours?: string;

    // 給与情報
    salaryMin?: number;              // 最低年収（円）
    salaryMax?: number;              // 最高年収（円）
    salaryText: string;              // 元のテキスト

    // 勤務地情報
    locations: Location[];           // 配列（複数拠点対応）
    locationSummary: string;

    // ラベル・タグ
    labels: string[];                // "未経験OK", "リモート可"など
    keywords: string[];              // 自由形式キーワード

    // 日付情報
    datePosted: string;              // ISO 8601形式
    dateExpires?: string;            // ISO 8601形式
    dateUpdated?: string;            // ISO 8601形式

    // スクレイピング管理
    scrapedAt: string;               // ISO 8601形式
    lastCheckedAt: string;           // ISO 8601形式
    isActive: boolean;               // アクティブフラグ

    // NGキーワードチェック用
    ngKeywordMatches?: string[];     // マッチしたNGキーワードリスト
}

export interface Location {
    region?: string;                 // 都道府県
    locality?: string;               // 市区町村
    address?: string;                // 詳細住所
}
