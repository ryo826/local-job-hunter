-- database/migrations/001_initial.sql

-- 求人テーブル
CREATE TABLE IF NOT EXISTS jobs (
    -- 主キー
    id TEXT PRIMARY KEY,                    -- "doda_3014345383", "rikunabi_jk9b4...", "mynavi_99359-1-160-1"
    
    -- メタデータ
    source TEXT NOT NULL,                   -- "doda", "rikunabi", "mynavi"
    source_job_id TEXT NOT NULL,            -- 各サイト固有のID
    source_url TEXT NOT NULL UNIQUE,        -- 求人詳細URL
    
    -- 企業情報
    company_name TEXT NOT NULL,
    company_url TEXT,
    company_logo TEXT,
    
    -- 求人基本情報
    title TEXT NOT NULL,
    employment_type TEXT,                   -- 正社員、契約社員など
    industry TEXT,
    
    -- 詳細情報（長文）
    description TEXT,
    requirements TEXT,
    benefits TEXT,
    work_hours TEXT,
    
    -- 給与情報
    salary_min INTEGER,                     -- 最低年収（円）
    salary_max INTEGER,                     -- 最高年収（円）
    salary_text TEXT,                       -- 元のテキスト
    
    -- 勤務地情報（JSON）
    locations TEXT,                         -- JSON配列
    location_summary TEXT,
    
    -- ラベル・タグ（JSON）
    labels TEXT,                            -- JSON配列
    keywords TEXT,                          -- JSON配列
    
    -- 日付情報
    date_posted TEXT,                       -- ISO 8601形式
    date_expires TEXT,
    date_updated TEXT,
    
    -- スクレイピング管理
    scraped_at TEXT NOT NULL,
    last_checked_at TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,            -- 0 or 1
    
    -- NGキーワードマッチ（JSON）
    ng_keyword_matches TEXT,                -- JSON配列
    
    -- インデックス
    CONSTRAINT unique_source_job UNIQUE (source, source_job_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_name);
CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs(date_posted);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_scraped ON jobs(scraped_at);

-- 企業テーブル
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,                    -- "doda_99359", "rikunabi_company123"
    source TEXT NOT NULL,
    source_company_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    company_url TEXT,
    logo_url TEXT,
    total_jobs INTEGER DEFAULT 0,
    first_seen TEXT,
    last_seen TEXT,
    scraped_at TEXT,
    
    CONSTRAINT unique_source_company UNIQUE (source, source_company_id)
);

-- スクレイピングログテーブル
CREATE TABLE IF NOT EXISTS scraping_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scrape_type TEXT NOT NULL,              -- "search", "detail", "company"
    source TEXT NOT NULL,                   -- "doda", "rikunabi", "mynavi"
    target_url TEXT,
    status TEXT NOT NULL,                   -- "success", "error", "partial"
    jobs_found INTEGER DEFAULT 0,
    new_jobs INTEGER DEFAULT 0,
    updated_jobs INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,                    -- 実行時間（ミリ秒）
    scraped_at TEXT NOT NULL,
    
    CHECK (status IN ('success', 'error', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_logs_source ON scraping_logs(source);
CREATE INDEX IF NOT EXISTS idx_logs_status ON scraping_logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_scraped ON scraping_logs(scraped_at);

-- NGキーワードテーブル
CREATE TABLE IF NOT EXISTS ng_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL UNIQUE,
    category TEXT,                          -- "company", "title", "description"
    is_regex INTEGER DEFAULT 0,             -- 0 or 1
    created_at TEXT NOT NULL
);

-- ユーザー設定テーブル
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- デフォルト設定を挿入
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('doda_enabled', '1', datetime('now')),
    ('rikunabi_enabled', '1', datetime('now')),
    ('mynavi_enabled', '1', datetime('now')),
    ('scrape_interval_hours', '24', datetime('now')),
    ('rate_limit_ms', '2500', datetime('now')),
    ('max_concurrent', '1', datetime('now'));
