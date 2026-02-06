-- companies テーブル
CREATE TABLE companies (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  source TEXT,
  url TEXT UNIQUE NOT NULL,
  homepage_url TEXT,
  status TEXT DEFAULT 'new',
  industry TEXT,
  area TEXT,
  job_title TEXT,
  job_description TEXT,
  salary_text TEXT,
  representative TEXT,
  establishment TEXT,
  employees TEXT,
  revenue TEXT,
  phone TEXT,
  email TEXT,
  contact_form_url TEXT,
  contact_page_url TEXT,
  address TEXT,
  ai_summary TEXT,
  ai_tags TEXT,
  note TEXT,
  scrape_status TEXT DEFAULT 'pending',
  error_message TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  budget_rank TEXT CHECK(budget_rank IN ('A', 'B', 'C')),
  rank_confidence REAL,
  rank_detected_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ,
  update_count INTEGER DEFAULT 0,
  last_rank TEXT CHECK(last_rank IN ('A', 'B', 'C')),
  rank_changed_at TIMESTAMPTZ,
  job_count INTEGER DEFAULT 0,
  latest_job_title TEXT,
  listing_status TEXT DEFAULT '掲載中' CHECK(listing_status IN ('掲載中', '掲載終了')),
  job_page_updated_at TIMESTAMPTZ,
  job_page_end_date TIMESTAMPTZ,
  job_type TEXT
);

CREATE INDEX idx_companies_url ON companies(url);
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_budget_rank ON companies(budget_rank);

-- jobs テーブル
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  company_url TEXT,
  company_logo TEXT,
  title TEXT NOT NULL,
  employment_type TEXT,
  industry TEXT,
  description TEXT,
  requirements TEXT,
  benefits TEXT,
  work_hours TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_text TEXT,
  locations JSONB,
  location_summary TEXT,
  labels JSONB,
  keywords JSONB,
  date_posted TEXT,
  date_expires TEXT,
  date_updated TEXT,
  scraped_at TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  ng_keyword_matches JSONB,
  CONSTRAINT unique_source_job UNIQUE (source, source_job_id)
);

CREATE INDEX idx_jobs_source ON jobs(source);
CREATE INDEX idx_jobs_company ON jobs(company_name);
CREATE INDEX idx_jobs_active ON jobs(is_active);

-- RLS無効化（認証なしアクセス）
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to companies" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to jobs" ON jobs FOR ALL USING (true) WITH CHECK (true);
