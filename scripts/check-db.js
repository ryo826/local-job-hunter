// データベーススキーマを確認するスクリプト
const Database = require('../node_modules/better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'local-job-hunter-pro',
    'companies.db'
);

console.log('データベースパス:', dbPath);
console.log('');

try {
    const db = new Database(dbPath, { readonly: true });

    // テーブル一覧
    console.log('=== テーブル一覧 ===');
    const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `).all();
    tables.forEach(t => console.log(`  - ${t.name}`));
    console.log('');

    // jobsテーブルのスキーマ
    console.log('=== jobsテーブルのスキーマ ===');
    const jobsSchema = db.prepare('PRAGMA table_info(jobs)').all();
    jobsSchema.forEach(col => {
        console.log(`  ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
    });
    console.log('');

    // jobsテーブルのインデックス
    console.log('=== jobsテーブルのインデックス ===');
    const indexes = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='index' AND tbl_name='jobs'
  `).all();
    indexes.forEach(idx => console.log(`  - ${idx.name}`));
    console.log('');

    // データ件数
    console.log('=== データ件数 ===');
    const jobCount = db.prepare('SELECT COUNT(*) as count FROM jobs').get();
    console.log(`  jobs: ${jobCount.count}件`);

    const companyCount = db.prepare('SELECT COUNT(*) as count FROM companies').get();
    console.log(`  companies: ${companyCount.count}件`);

    const logCount = db.prepare('SELECT COUNT(*) as count FROM scraping_logs').get();
    console.log(`  scraping_logs: ${logCount.count}件`);
    console.log('');

    // 最新の求人データ(あれば)
    if (jobCount.count > 0) {
        console.log('=== 最新の求人データ(5件) ===');
        const recentJobs = db.prepare(`
      SELECT id, source, company_name, title, scraped_at
      FROM jobs
      ORDER BY scraped_at DESC
      LIMIT 5
    `).all();
        recentJobs.forEach(job => {
            console.log(`  [${job.source}] ${job.company_name} - ${job.title}`);
            console.log(`    ID: ${job.id}`);
            console.log(`    取得日時: ${job.scraped_at}`);
        });
    }

    db.close();
    console.log('\n✅ データベーススキーマの確認が完了しました');

} catch (error) {
    console.error('❌ エラー:', error.message);
    process.exit(1);
}
