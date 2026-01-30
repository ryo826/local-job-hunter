-- database/migrations/002_add_indexes.sql

-- パフォーマンス最適化のための追加インデックス

-- 給与検索用
CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON jobs(salary_min) WHERE salary_min IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_salary_max ON jobs(salary_max) WHERE salary_max IS NOT NULL;

-- 勤務地検索用（全文検索）
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location_summary);

-- 複合インデックス（よく使う検索パターン）
CREATE INDEX IF NOT EXISTS idx_jobs_source_active ON jobs(source, is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_source_posted ON jobs(source, date_posted);

-- NGキーワードマッチング用
CREATE INDEX IF NOT EXISTS idx_jobs_ng_matches ON jobs(ng_keyword_matches) WHERE ng_keyword_matches IS NOT NULL;
