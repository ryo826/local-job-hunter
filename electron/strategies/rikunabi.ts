import { Page, Locator } from 'playwright';
import { ScrapingStrategy, CompanyData, ScrapingParams, ScrapingCallbacks, BudgetRank, JobCardInfo } from './ScrapingStrategy';
import { normalizeIndustry, normalizeArea, normalizeSalary, normalizeEmployees } from '../utils/data-normalizer';
import {
    randomDelay,
    loadPageWithRetry,
    extractTotalCount,
    normalizeAddress as normalizeAddressUtil,
    cleanCompanyName as cleanCompanyNameUtil,
    extractPrefectureFromAddress,
} from '../utils/scraping-utils';

// ランク判定結果
interface RankResult {
    rank: BudgetRank;
    confidence: number;
}

// __NEXT_DATA__から求人ページの公開日を抽出
async function extractRikunabiJobDate(page: Page): Promise<Date | null> {
    try {
        const datePublished = await page.evaluate(() => {
            const scriptTag = document.querySelector('script#__NEXT_DATA__');
            if (!scriptTag?.textContent) return null;

            try {
                const data = JSON.parse(scriptTag.textContent);
                // datePublishedはミリ秒のタイムスタンプ
                const timestamp = data?.props?.pageProps?.job?.lettice?.letticeLogBase?.datePublished;
                if (timestamp) {
                    return timestamp;
                }
                // 別のパスを試す
                const jobData = data?.props?.pageProps?.jobData;
                if (jobData?.datePublished) {
                    return jobData.datePublished;
                }
                return null;
            } catch {
                return null;
            }
        });

        if (datePublished && typeof datePublished === 'number') {
            return new Date(datePublished);
        }
        return null;
    } catch {
        return null;
    }
}

// リクナビNEXTのランク判定ロジック
// 実際のHTML調査結果に基づく判定:
// - "premium" クラス: 最上位プラン → A級 (7件検出)
// - "flair" クラス (Job Flair): 有料オプション → A級 (100回出現)
// - 「積極採用中」ラベル: 有料プラン → A級
// - それ以外: 通常プラン → B〜C級（ページ位置で判定）
async function classifyRikunabi(card: Locator, displayIndex: number, pageNum: number): Promise<RankResult> {
    try {
        // 1. "premium" クラスの検出（最上位プラン）
        const hasPremium = await card.locator('[class*="premium"]').count() > 0;
        if (hasPremium) {
            return { rank: 'A', confidence: 0.95 };  // プレミアム（最上位）
        }

        // 2. "flair" クラスの検出（Job Flair有料オプション）
        const hasFlair = await card.locator('[class*="flair"]').count() > 0;
        if (hasFlair) {
            return { rank: 'A', confidence: 0.9 };  // Job Flair付き
        }

        // 3. 「積極採用中」ラベルの検出
        const hasActiveLabel = await card.locator('text=積極採用中').count() > 0;
        if (hasActiveLabel) {
            return { rank: 'A', confidence: 0.85 };  // 積極採用中ラベル
        }

        // 4. sponsored クラスの検出（スポンサー枠）
        const hasSponsored = await card.locator('[class*="sponsored"]').count() > 0;
        if (hasSponsored) {
            return { rank: 'A', confidence: 0.85 };  // スポンサー枠
        }

        // 5. ページ位置による判定（通常プラン）
        const absoluteIndex = (pageNum - 1) * 100 + displayIndex;
        if (absoluteIndex < 50) {
            return { rank: 'B', confidence: 0.7 };  // 1ページ目上位50件
        } else if (absoluteIndex < 100) {
            return { rank: 'B', confidence: 0.6 };  // 1ページ目下位
        } else {
            return { rank: 'C', confidence: 0.5 };  // 2ページ目以降
        }
    } catch (error) {
        console.warn(`Rank classification failed: ${error}`);
        return { rank: 'C', confidence: 0.3 }; // デフォルトで最下位ランク
    }
}

// リクナビNEXT都道府県マッピング（英語名）
// URL形式: https://next.rikunabi.com/job_search/area-{英語名}/
const prefectureCodes: Record<string, string> = {
    '北海道': 'hokkaido',
    '青森県': 'aomori',
    '岩手県': 'iwate',
    '宮城県': 'miyagi',
    '秋田県': 'akita',
    '山形県': 'yamagata',
    '福島県': 'fukushima',
    '茨城県': 'ibaraki',
    '栃木県': 'tochigi',
    '群馬県': 'gunma',
    '埼玉県': 'saitama',
    '千葉県': 'chiba',
    '東京都': 'tokyo',
    '神奈川県': 'kanagawa',
    '新潟県': 'niigata',
    '富山県': 'toyama',
    '石川県': 'ishikawa',
    '福井県': 'fukui',
    '山梨県': 'yamanashi',
    '長野県': 'nagano',
    '岐阜県': 'gifu',
    '静岡県': 'shizuoka',
    '愛知県': 'aichi',
    '三重県': 'mie',
    '滋賀県': 'shiga',
    '京都府': 'kyoto',
    '大阪府': 'osaka',
    '兵庫県': 'hyogo',
    '奈良県': 'nara',
    '和歌山県': 'wakayama',
    '鳥取県': 'tottori',
    '島根県': 'shimane',
    '岡山県': 'okayama',
    '広島県': 'hiroshima',
    '山口県': 'yamaguchi',
    '徳島県': 'tokushima',
    '香川県': 'kagawa',
    '愛媛県': 'ehime',
    '高知県': 'kochi',
    '福岡県': 'fukuoka',
    '佐賀県': 'saga',
    '長崎県': 'nagasaki',
    '熊本県': 'kumamoto',
    '大分県': 'oita',
    '宮崎県': 'miyazaki',
    '鹿児島県': 'kagoshima',
    '沖縄県': 'okinawa',
};

// リクナビNEXT職種カテゴリマッピング（URLコード）
// URL形式: /oc-{コード}/
// 実際のURL例: https://next.rikunabi.com/job_search/area-tokyo/oc-sales/sal-over500/
// 職種一覧（name属性）:
// 1:営業・販売, 2:経営・事業企画・人事・事務, 3:IT・Web・ゲームエンジニア,
// 4:メディア・クリエイター, 5:エンジニアリング・設計開発, 6:製造・工場,
// 7:マーケティング・広告・宣伝, 8:飲食・フードサービス, 9:旅行・レジャー・イベント,
// 10:ビューティー・生活サービス, 11:倉庫・物流管理, 12:ドライバー・配送スタッフ,
// 13:整備・修理, 14:清掃・美化, 15:警備・保安, 16:建設・土木・施工,
// 17:金融・財務・会計, 18:法務・法律, 19:研究, 20:医療・看護師・薬剤師,
// 21:介護・福祉, 22:保育士・教員・講師, 23:農林漁業
const jobTypeCodes: Record<string, string> = {
    // リクナビNEXTのサイト固有職種名 → URLコード（実URL確認済み）
    '営業・販売': 'sales',                          // 1 ✓
    '経営・事業企画・人事・事務': 'management',     // 2 ✓
    'IT・Web・ゲームエンジニア': 'it',              // 3 ✓
    'メディア・クリエイター': 'media',              // 4 ✓
    'エンジニアリング・設計開発': 'engineering',    // 5 ✓
    '製造・工場': 'manufacturing',                  // 6 ✓
    'マーケティング・広告・宣伝': 'marketing',      // 7 ✓
    '飲食・フードサービス': 'food',                 // 8 ✓
    '旅行・レジャー・イベント': 'tourism',          // 9 ✓
    'ビューティー・生活サービス': 'beauty',         // 10 ✓
    '倉庫・物流管理': 'logistics',                  // 11 ✓
    'ドライバー・配送スタッフ': 'driver',           // 12 ✓
    '整備・修理': 'maintenance',                    // 13 ✓
    '清掃・美化': 'cleaning',                       // 14 ✓
    '警備・保安': 'security',                       // 15 ✓
    '建設・土木・施工': 'construction',             // 16 ✓
    '金融・財務・会計': 'finance',                  // 17 ✓
    '法務・法律': 'legal',                          // 18
    '研究': 'research',                             // 19
    '医療・看護師・薬剤師': 'medical',              // 20
    '介護・福祉': 'welfare',                        // 21
    '保育士・教員・講師': 'education',              // 22
    '農林漁業': 'agriculture',                      // 23
    // 15統合カテゴリからのエイリアス
    '営業・販売・カスタマー対応': 'sales',                    // ① → 営業・販売
    '企画・マーケティング・経営': 'management',               // ② → 経営・事業企画・人事・事務
    '事務・管理・アシスタント': 'management',                 // ③ → 経営・事業企画・人事・事務
    'ITエンジニア・Web・ゲーム': 'it',                        // ④ → IT・Web・ゲームエンジニア
    '電気・電子・機械・半導体・制御': 'engineering',          // ⑤ → エンジニアリング・設計開発
    '化学・素材・食品・医薬': 'research',                     // ⑥ → 研究
    '建築・土木・設備・プラント・不動産技術': 'construction', // ⑦ → 建設・土木・施工
    'クリエイティブ・デザイン': 'media',                      // ⑧ → メディア・クリエイター
    'コンサルタント・専門職': 'management',                   // ⑨ → 経営・事業企画・人事・事務
    '金融専門職': 'finance',                                  // ⑩ → 金融・財務・会計
    '医療・介護・福祉': 'medical',                            // ⑪ → 医療・看護師・薬剤師
    '教育・保育・公共サービス': 'education',                  // ⑫ → 保育士・教員・講師
    'サービス・外食・レジャー・美容・ホテル・交通': 'tourism',// ⑬ → 旅行・レジャー・イベント
    '物流・運輸・技能工・設備・製造': 'logistics',            // ⑭ → 倉庫・物流管理
    '公務員・団体職員・その他': 'agriculture',                // ⑮ → 農林漁業（近いカテゴリ）
};

export class RikunabiStrategy implements ScrapingStrategy {
    readonly source = 'rikunabi';

    // レート制限設定
    private readonly REQUEST_INTERVAL = 1000;  // 1秒
    private readonly PAGE_INTERVAL = 1500;     // 1.5秒

    async *scrape(page: Page, params: ScrapingParams, callbacks?: ScrapingCallbacks): AsyncGenerator<CompanyData> {
        const { keywords, prefectures, jobTypes } = params;
        const { onLog, onTotalCount } = callbacks || {};

        const log = (msg: string) => {
            if (onLog) onLog(msg);
            else console.log(`[Rikunabi] ${msg}`);
        };

        // 検索結果ページURL構築
        // URL形式: https://next.rikunabi.com/job_search/area-{英語名}/oc-{職種英語名}/
        const searchUrl = this.buildSearchUrl(params);
        let currentSearchUrl = searchUrl;

        log(`Navigating to: ${searchUrl}`);

        // HTTP/2エラー対策: 複数回リトライ
        let retries = 3;
        let pageLoaded = false;

        while (retries > 0 && !pageLoaded) {
            try {
                // ステルス設定: webdriverフラグを削除
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                    (window as any).chrome = { runtime: {} };
                });

                await page.setExtraHTTPHeaders({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Upgrade-Insecure-Requests': '1',
                });

                log('Navigating to search page...');
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

                // Next.js SPAのため、networkidleを待つ
                log('Waiting for network to settle...');
                try {
                    await page.waitForLoadState('networkidle', { timeout: 30000 });
                } catch {
                    log('Network idle timeout, continuing...');
                }

                // 追加待機 - JSの実行完了を待つ
                await page.waitForTimeout(3000);

                // 求人カードが表示されるまで待機
                log('Waiting for job cards to load...');
                try {
                    await page.waitForSelector('a[class*="styles_bigCard"]', { timeout: 15000 });
                    log('Job cards found!');
                } catch {
                    log('Warning: Job card selector not found, trying alternative...');
                    // 代替セレクターを試す
                    try {
                        await page.waitForSelector('[class*="styles_detailArea"]', { timeout: 10000 });
                        log('Found detailArea elements');
                    } catch {
                        log('Warning: No job cards found after extended wait');
                    }
                }

                pageLoaded = true;
                log('Page loaded successfully');

                // 総件数を取得してコールバックで報告
                if (onTotalCount) {
                    try {
                        // 複数のセレクターを試行
                        const countSelectors = [
                            '.styles_bodyText__KY7__',
                            '[class*="styles_bodyText"]',
                            '[class*="searchCount"]',
                            '.search-result-count',
                        ];

                        let found = false;
                        for (const selector of countSelectors) {
                            const countElement = page.locator(selector).first();
                            if (await countElement.count() > 0) {
                                const text = await countElement.textContent();
                                log(`Count selector ${selector} found text: "${text}"`);
                                if (text) {
                                    const match = text.match(/([0-9,]+)/);
                                    if (match) {
                                        const count = parseInt(match[1].replace(/,/g, ''), 10);
                                        if (!isNaN(count) && count > 0) {
                                            log(`Total jobs: ${count}`);
                                            onTotalCount(count);
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if (!found) {
                            // ページ内のテキストから件数を探す
                            const pageText = await page.evaluate(() => document.body.innerText);
                            const match = pageText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*件/);
                            if (match) {
                                const num = parseInt(match[1].replace(/,/g, ''), 10);
                                if (!isNaN(num) && num > 0) {
                                    log(`Total jobs (from page text): ${num}`);
                                    onTotalCount(num);
                                }
                            } else {
                                log('Could not find total count on page');
                            }
                        }
                    } catch (e) {
                        log(`Failed to get total count: ${e}`);
                    }
                }

            } catch (error: any) {
                retries--;
                log(`Error loading search page (${3 - retries}/3): ${error.message}`);
                if (retries > 0) {
                    log(`Retrying in 5 seconds...`);
                    await page.waitForTimeout(5000);
                } else {
                    log(`All retries failed. Stopping.`);
                    return;
                }
            }
        }

        let hasNext = true;
        let pageNum = 0;
        const maxPages = 500;  // 制限を緩和

        while (hasNext && pageNum < maxPages) {
            pageNum++;
            log(`Scraping page ${pageNum}...`);

            // 求人カードを取得 (正しいセレクター: a[class*="styles_bigCard"])
            const jobCards = await page.locator('a[class*="styles_bigCard"]').all();
            log(`Found ${jobCards.length} job cards`);

            if (jobCards.length === 0) {
                // デバッグ: ページ状態を確認
                const pageState = await page.evaluate(() => {
                    return {
                        title: document.title,
                        bodyTextLength: document.body.innerText.length,
                        allLinks: document.querySelectorAll('a').length,
                        hasNextDiv: !!document.getElementById('__next')
                    };
                });
                log(`Page state: title="${pageState.title}", textLength=${pageState.bodyTextLength}, links=${pageState.allLinks}, hasNext=${pageState.hasNextDiv}`);

                log('No job cards found, stopping');
                break;
            }

            // 各カードからURLとランクを収集
            const jobUrlsWithRank: { url: string; rankResult: RankResult }[] = [];
            for (let displayIndex = 0; displayIndex < jobCards.length; displayIndex++) {
                const card = jobCards[displayIndex];
                const href = await card.getAttribute('href');
                if (href && href.includes('/viewjob/')) {
                    // ランク判定
                    const rankResult = await classifyRikunabi(card, displayIndex, pageNum);
                    jobUrlsWithRank.push({ url: href, rankResult });
                }
            }
            log(`Collected ${jobUrlsWithRank.length} job URLs (Page ${pageNum})`);

            // 各求人詳細ページを訪問
            for (const jobInfo of jobUrlsWithRank) {
                try {
                    const fullUrl = jobInfo.url.startsWith('http') ? jobInfo.url : `https://next.rikunabi.com${jobInfo.url}`;
                    log(`Visiting: ${fullUrl}`);

                    // レート制限
                    await page.waitForTimeout(this.REQUEST_INTERVAL);

                    // 詳細ページへ移動
                    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    try {
                        await page.waitForLoadState('networkidle', { timeout: 15000 });
                    } catch {
                        // タイムアウトは無視
                    }
                    await page.waitForTimeout(2000);

                    // 求人タイトルを取得
                    let jobTitle = '';
                    const titleEl = page.locator('h1[class*="styles_heading"], h2[class*="styles_title"]').first();
                    if (await titleEl.count() > 0) {
                        jobTitle = (await titleEl.textContent())?.trim() || '';
                    }

                    // 会社名を取得 (会社名リンク: a[class*="styles_linkTextCompany"])
                    let companyName = '';
                    const companyLinkEl = page.locator('a[class*="styles_linkTextCompany"]').first();
                    if (await companyLinkEl.count() > 0) {
                        companyName = (await companyLinkEl.textContent())?.trim() || '';
                    }

                    // 会社名がない場合、別のセレクターを試す
                    if (!companyName) {
                        const employerNameEl = page.locator('[class*="styles_employerName"]').first();
                        if (await employerNameEl.count() > 0) {
                            companyName = (await employerNameEl.textContent())?.trim() || '';
                        }
                    }

                    if (!companyName) {
                        log('No company name found, skipping');
                        continue;
                    }

                    log(`Found: ${companyName}`);

                    // 募集要項テーブルから情報を抽出
                    const jobDetails = await this.extractJobDetails(page, log);

                    // 企業情報を抽出
                    const companyInfo = await this.extractCompanyInfo(page, log);

                    // デバッグ: 抽出されたキーを表示
                    log(`Company info keys: ${Object.keys(companyInfo).join(', ')}`);

                    // データを統合
                    const address = companyInfo['本社所在地'] || jobDetails['勤務地'] || '';
                    const normalizedAddress = normalizeAddressUtil(address);
                    const cleanName = cleanCompanyNameUtil(companyName);

                    // 企業HPを複数のラベル名で検索（'企業ホームページ'を優先）
                    const homepageUrl = companyInfo['企業ホームページ'] || companyInfo['企業HP'] || companyInfo['ホームページ'] || companyInfo['HP'] || companyInfo['WEBサイト'] || companyInfo['Webサイト'] || companyInfo['公式サイト'] || '';

                    yield {
                        source: this.source,
                        url: page.url(),
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: normalizeSalary(jobDetails['給与']),
                        representative: companyInfo['代表者'] || '',
                        establishment: companyInfo['設立'] || '',
                        employees: normalizeEmployees(companyInfo['従業員数']),
                        revenue: companyInfo['売上高'] || '',
                        phone: companyInfo['企業代表番号'] || '',
                        address: normalizedAddress,
                        area: normalizeArea(extractPrefectureFromAddress(normalizedAddress)),
                        homepage_url: homepageUrl,
                        industry: normalizeIndustry(companyInfo['事業内容']),
                        scrape_status: 'step1_completed',
                        // ランク情報
                        budget_rank: jobInfo.rankResult.rank,
                        rank_confidence: jobInfo.rankResult.confidence,
                        // 求人ページ更新日情報（__NEXT_DATA__から取得）
                        job_page_updated_at: (await extractRikunabiJobDate(page))?.toISOString() || null,
                    };

                } catch (err: any) {
                    log(`Error scraping job: ${err.message}`);
                    continue;
                }
            }

            // 検索結果ページに戻る
            log('Returning to search results...');
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            try {
                await page.waitForLoadState('networkidle', { timeout: 15000 });
            } catch {
                // タイムアウトは無視
            }
            await page.waitForTimeout(this.PAGE_INTERVAL);

            // 次のページへ (aria-label="次へ" を使用)
            const nextButton = page.locator('a[aria-label="次へ"]').first();
            if (await nextButton.count() > 0) {
                const isDisabled = await nextButton.getAttribute('aria-disabled');
                if (isDisabled === 'true') {
                    log('Next button is disabled, no more pages');
                    hasNext = false;
                } else {
                    log('Clicking next page...');
                    await nextButton.click();
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 15000 });
                    } catch {
                        // タイムアウトは無視
                    }
                    await page.waitForTimeout(3000);
                }
            } else {
                log('No next page button found');
                hasNext = false;
            }
        }

        log(`Completed scraping ${pageNum} pages`);
    }

    // 募集要項テーブルから情報を抽出
    private async extractJobDetails(page: Page, log: (msg: string) => void): Promise<Record<string, string>> {
        const details: Record<string, string> = {};

        try {
            // 募集要項テーブル: table[class*="styles_tableAboutApplication"]
            const table = page.locator('table[class*="styles_tableAboutApplication"]').first();
            if (await table.count() === 0) {
                log('Job details table not found');
                return details;
            }

            // テーブル行: tr[class*="styles_row"]
            const rows = await table.locator('tr[class*="styles_row"]').all();

            for (const row of rows) {
                try {
                    // ラベル: th[class*="styles_title"]
                    const labelEl = row.locator('th[class*="styles_title"]');
                    if (await labelEl.count() === 0) continue;

                    const label = (await labelEl.textContent())?.trim() || '';
                    if (!label) continue;

                    // 内容: td[class*="styles_content"]
                    const contentEl = row.locator('td[class*="styles_content"]');
                    if (await contentEl.count() === 0) continue;

                    const content = (await contentEl.textContent())?.trim() || '';
                    details[label] = content;
                } catch {
                    // 個別行のエラーは無視
                }
            }
        } catch (error: any) {
            log(`Error extracting job details: ${error.message}`);
        }

        return details;
    }

    // 企業情報を抽出
    private async extractCompanyInfo(page: Page, log: (msg: string) => void): Promise<Record<string, string>> {
        const info: Record<string, string> = {};

        try {
            // 方法1: 企業情報テーブル (tbody[class*="companyInfo"])
            const companyTable = page.locator('tbody[class*="companyInfo"], tbody[class*="styles_companyInfo"]');
            if (await companyTable.count() > 0) {
                const rows = await companyTable.locator('tr').all();
                for (const row of rows) {
                    try {
                        const labelEl = row.locator('th h3, th[class*="title"], th');
                        const label = (await labelEl.textContent())?.trim() || '';
                        if (!label) continue;

                        const contentEl = row.locator('td');
                        if (await contentEl.count() === 0) continue;

                        // リンクがある場合はhrefを取得 (企業HPなど)
                        const linkEl = contentEl.locator('a[href^="http"]');
                        if (await linkEl.count() > 0) {
                            const href = await linkEl.getAttribute('href');
                            if (href && !href.includes('rikunabi.com')) {
                                info[label] = href;
                                continue;
                            }
                        }
                        info[label] = (await contentEl.textContent())?.trim() || '';
                    } catch {
                        // 個別行のエラーは無視
                    }
                }
            }

            // 方法2: 「企業情報」セクションを探す
            if (Object.keys(info).length === 0) {
                const companySection = page.locator('section:has(h2:has-text("企業情報")), [class*="companyInfo"], [class*="company-info"]');
                if (await companySection.count() > 0) {
                    const rows = await companySection.locator('tr').all();
                    for (const row of rows) {
                        try {
                            const labelEl = row.locator('th');
                            const label = (await labelEl.textContent())?.trim() || '';
                            if (!label) continue;

                            const contentEl = row.locator('td');
                            const linkEl = contentEl.locator('a[href^="http"]');
                            if (await linkEl.count() > 0) {
                                const href = await linkEl.getAttribute('href');
                                if (href && !href.includes('rikunabi.com')) {
                                    info[label] = href;
                                    continue;
                                }
                            }
                            info[label] = (await contentEl.textContent())?.trim() || '';
                        } catch {
                            // ignore
                        }
                    }
                }
            }

            // 方法3: dt/ddパターン
            if (Object.keys(info).length === 0) {
                const dlElements = await page.locator('dl').all();
                for (const dl of dlElements) {
                    const dtElements = await dl.locator('dt').all();
                    for (const dt of dtElements) {
                        try {
                            const label = (await dt.textContent())?.trim() || '';
                            if (!label) continue;
                            const dd = dt.locator('~ dd').first();
                            if (await dd.count() > 0) {
                                const linkEl = dd.locator('a[href^="http"]');
                                if (await linkEl.count() > 0) {
                                    const href = await linkEl.getAttribute('href');
                                    if (href && !href.includes('rikunabi.com')) {
                                        info[label] = href;
                                        continue;
                                    }
                                }
                                info[label] = (await dd.textContent())?.trim() || '';
                            }
                        } catch {
                            // ignore
                        }
                    }
                }
            }

            // 企業HP URLを直接探す（フォールバック）
            if (!info['企業HP'] && !info['ホームページ'] && !info['HP']) {
                // 方法4: ページ内の外部リンクを探す
                const result = await page.evaluate(() => {
                    // 企業HPラベルの近くにあるリンクを探す
                    const hpLabels = ['企業HP', 'ホームページ', 'HP', '企業サイト', 'コーポレートサイト', '会社HP'];

                    for (const label of hpLabels) {
                        // th要素でラベルを探す
                        const ths = document.querySelectorAll('th');
                        for (const th of ths) {
                            if (th.textContent?.includes(label)) {
                                const tr = th.closest('tr');
                                if (tr) {
                                    const link = tr.querySelector('a[href^="http"]') as HTMLAnchorElement;
                                    if (link && !link.href.includes('rikunabi.com')) {
                                        return link.href;
                                    }
                                }
                            }
                        }

                        // dt要素でラベルを探す
                        const dts = document.querySelectorAll('dt');
                        for (const dt of dts) {
                            if (dt.textContent?.includes(label)) {
                                const dd = dt.nextElementSibling;
                                if (dd && dd.tagName === 'DD') {
                                    const link = dd.querySelector('a[href^="http"]') as HTMLAnchorElement;
                                    if (link && !link.href.includes('rikunabi.com')) {
                                        return link.href;
                                    }
                                }
                            }
                        }
                    }

                    // 最後の手段: 外部リンクでURLがテキストとして表示されているもの
                    const allLinks = document.querySelectorAll('a[href^="http"]');
                    for (const link of allLinks) {
                        const href = (link as HTMLAnchorElement).href;
                        const text = link.textContent?.trim() || '';
                        if (!href.includes('rikunabi.com') &&
                            !href.includes('google.com') &&
                            text.startsWith('http')) {
                            return href;
                        }
                    }

                    return null;
                });

                if (result) {
                    info['企業HP'] = result;
                    log(`Found company URL via fallback: ${result}`);
                }
            }

        } catch (error: any) {
            log(`Error extracting company info: ${error.message}`);
        }

        return info;
    }

    // 検索URLを構築するヘルパーメソッド
    // URL形式: https://next.rikunabi.com/job_search/area-{勤務地}/oc-{職種}/sal-over{年収}/
    // 例: https://next.rikunabi.com/job_search/area-tokyo/oc-sales/sal-over500/
    private buildSearchUrl(params: ScrapingParams): string {
        const { keywords, prefectures, jobTypes, minSalary } = params;

        // パスベースのURL構築（順序: area → oc → sal）
        let pathParts: string[] = [];

        // 勤務地フィルター（例: area-tokyo）
        if (prefectures && prefectures.length > 0) {
            const prefCode = prefectureCodes[prefectures[0]];
            if (prefCode) {
                pathParts.push(`area-${prefCode}`);
            }
        }

        // 職種フィルター（例: oc-sales）
        if (jobTypes && jobTypes.length > 0) {
            const jobCode = jobTypeCodes[jobTypes[0]];
            if (jobCode) {
                pathParts.push(`oc-${jobCode}`);
            }
        }

        // 年収フィルター（例: sal-over500 = 500万円以上）
        if (minSalary && minSalary > 0) {
            pathParts.push(`sal-over${minSalary}`);
        }

        // URL構築
        let searchUrl = 'https://next.rikunabi.com/job_search/';
        if (pathParts.length > 0) {
            searchUrl += pathParts.join('/') + '/';
        }

        // キーワードはクエリパラメータで追加
        if (keywords) {
            searchUrl += `?kw=${encodeURIComponent(keywords)}`;
        }

        return searchUrl;
    }

    // 総求人件数を取得
    async getTotalJobCount(page: Page, params: ScrapingParams): Promise<number | undefined> {
        try {
            const searchUrl = this.buildSearchUrl(params);

            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);

            // リクナビNEXTの検索結果件数を取得
            // セレクタ: .styles_bodyText__KY7__ (数字+「件」or「件以上」: 1475件以上, 1702件)
            const element = page.locator('.styles_bodyText__KY7__').first();
            if (await element.count() > 0) {
                const text = await element.textContent();
                if (text) {
                    // "1475件以上" or "1702件" から数字を抽出
                    const match = text.match(/([0-9,]+)/);
                    if (match) {
                        return parseInt(match[1].replace(/,/g, ''), 10);
                    }
                }
            }

            return undefined;
        } catch (error) {
            console.error('Failed to get total job count:', error);
            return undefined;
        }
    }

    // 並列スクレイピング用: リストページから求人URLを一括収集
    async collectJobUrls(page: Page, params: ScrapingParams, callbacks?: ScrapingCallbacks): Promise<JobCardInfo[]> {
        const { onLog, onTotalCount } = callbacks || {};
        const log = (msg: string) => onLog ? onLog(msg) : console.log(`[Rikunabi] ${msg}`);

        const searchUrl = this.buildSearchUrl(params);
        log(`Collecting job URLs from: ${searchUrl}`);

        const allJobs: JobCardInfo[] = [];

        // HTTP/2エラー対策: リトライロジック
        let retries = 3;
        let pageLoaded = false;

        while (retries > 0 && !pageLoaded) {
            try {
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                });

                await page.setExtraHTTPHeaders({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                });

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(randomDelay(500, 1000));
                pageLoaded = true;
            } catch (error: any) {
                retries--;
                log(`Error loading page (${3 - retries}/3): ${error.message}`);
                if (retries > 0) {
                    log(`Retrying in 3 seconds...`);
                    await page.waitForTimeout(3000);
                } else {
                    log(`All retries failed.`);
                    return allJobs;
                }
            }
        }

        try {
            // SPAのためJavaScriptの実行完了を待つ
            log('Waiting for page to fully load...');
            try {
                await page.waitForLoadState('networkidle', { timeout: 15000 });
            } catch {
                log('Network idle timeout, continuing...');
            }
            await page.waitForTimeout(3000);

            // 求人カードを待機
            log('Waiting for job cards...');
            try {
                await page.waitForSelector('a[class*="styles_bigCard"], [class*="jobCard"], article a', { timeout: 10000 });
                log('Job cards appeared');
            } catch {
                log('Job cards not found, checking page state...');
                const pageState = await page.evaluate(() => ({
                    title: document.title,
                    url: location.href,
                    hasNext: !!document.getElementById('__next'),
                    bodyText: document.body.innerText.substring(0, 500)
                }));
                log(`Page state: ${JSON.stringify(pageState)}`);
            }

            // 総件数を取得
            if (onTotalCount) {
                const countElement = page.locator('.styles_bodyText__KY7__, [class*="styles_bodyText"], [class*="count"]').first();
                if (await countElement.count() > 0) {
                    const text = await countElement.textContent();
                    if (text) {
                        const match = text.match(/([0-9,]+)/);
                        if (match) {
                            const num = parseInt(match[1].replace(/,/g, ''), 10);
                            if (!isNaN(num)) {
                                log(`Total jobs: ${num}`);
                                onTotalCount(num);
                            }
                        }
                    }
                }
            }

            // ランクフィルターの設定
            // Rikunabiのランク: A=有料オプション(上位に集中), B=1-50位, C=51位以降
            const rankFilter = params.rankFilter;
            const includeA = !rankFilter || rankFilter.length === 0 || rankFilter.includes('A');
            const includeB = !rankFilter || rankFilter.length === 0 || rankFilter.includes('B');
            const includeC = !rankFilter || rankFilter.length === 0 || rankFilter.includes('C');

            // B/Cの境界位置（Aランクを除いた位置でカウント）
            const B_MAX_POSITION = 50;  // Bランクは1-50位

            if (rankFilter && rankFilter.length > 0) {
                log(`ランクフィルター: ${rankFilter.join(', ')} (A=${includeA}, B=${includeB}, C=${includeC})`);
            }

            let hasNext = true;
            let pageNum = 0;
            let globalIndex = 0;  // 全体の表示順位
            let nonAIndex = 0;    // Aランク以外の位置（B/Cの判定用）
            let skippedA = 0;     // スキップしたAランク数
            const maxPages = 500;

            while (hasNext && pageNum < maxPages) {
                pageNum++;
                log(`Collecting URLs from page ${pageNum}...`);

                // 複数のセレクターを試行
                let jobCards = await page.locator('a[class*="styles_bigCard"]').all();
                if (jobCards.length === 0) {
                    jobCards = await page.locator('[class*="jobCard"] a, article a[href*="/viewjob/"]').all();
                }
                if (jobCards.length === 0) {
                    // デバッグ: リンクを探す
                    const allLinks = await page.locator('a[href*="/viewjob/"]').all();
                    log(`Found ${allLinks.length} links with /viewjob/`);
                    jobCards = allLinks;
                }
                log(`Found ${jobCards.length} job cards on page ${pageNum}`);

                if (jobCards.length === 0) break;

                let shouldBreak = false;
                for (let i = 0; i < jobCards.length; i++) {
                    try {
                        const card = jobCards[i];
                        const href = await card.getAttribute('href');
                        if (!href || !href.includes('/viewjob/')) continue;

                        const fullUrl = href.startsWith('http') ? href : `https://next.rikunabi.com${href}`;

                        // ランク判定（実際のHTML調査結果に基づく）
                        const hasPremium = await card.locator('[class*="premium"]').count() > 0;
                        const hasFlair = await card.locator('[class*="flair"]').count() > 0;
                        const hasActiveLabel = await card.locator('text=積極採用中').count() > 0;
                        const hasSponsored = await card.locator('[class*="sponsored"]').count() > 0;
                        const isARank = hasPremium || hasFlair || hasActiveLabel || hasSponsored;

                        let rank: BudgetRank;
                        if (isARank) {
                            rank = 'A';  // 有料オプション付き
                            // Aランクを含まない場合はスキップ
                            if (!includeA) {
                                skippedA++;
                                globalIndex++;
                                continue;
                            }
                        } else {
                            // Aランク以外の位置でB/Cを判定
                            if (nonAIndex < B_MAX_POSITION) {
                                rank = 'B';  // 1-50位
                            } else {
                                rank = 'C';  // 51位以降
                            }
                            nonAIndex++;

                            // Cランクに達したが、Cを含まない場合は収集終了
                            if (rank === 'C' && !includeC) {
                                log(`Cランク位置に到達、Cランク未選択のため収集終了 (収集: ${allJobs.length}件, Aスキップ: ${skippedA}件)`);
                                shouldBreak = true;
                                break;
                            }

                            // Bランクだが、Bを含まない場合はスキップ
                            if (rank === 'B' && !includeB) {
                                globalIndex++;
                                continue;
                            }
                        }

                        // 会社名を取得（カードから）
                        let companyName = '';
                        const companyEl = card.locator('[class*="styles_employerName"], [class*="companyName"]').first();
                        if (await companyEl.count() > 0) {
                            companyName = (await companyEl.textContent())?.trim() || '';
                        }

                        // 求人タイトルを取得
                        let jobTitle = '';
                        const titleEl = card.locator('[class*="styles_heading"], h2, h3').first();
                        if (await titleEl.count() > 0) {
                            jobTitle = (await titleEl.textContent())?.trim() || '';
                        }

                        allJobs.push({
                            url: fullUrl,
                            companyName,
                            jobTitle,
                            rank,
                            displayIndex: globalIndex,
                        });

                        globalIndex++;
                    } catch (err) {
                        // 個別エラーは無視
                        globalIndex++;
                    }
                }

                // 収集終了フラグ
                if (shouldBreak) {
                    hasNext = false;
                    break;
                }

                // 次のページへ
                const nextButton = page.locator('a[aria-label="次へ"]').first();
                if (await nextButton.count() > 0) {
                    const isDisabled = await nextButton.getAttribute('aria-disabled');
                    if (isDisabled === 'true') {
                        hasNext = false;
                    } else {
                        try {
                            await nextButton.click();
                            await page.waitForTimeout(randomDelay(500, 1000));
                        } catch (error) {
                            hasNext = false;
                        }
                    }
                } else {
                    hasNext = false;
                }
            }

            if (skippedA > 0) {
                log(`Aランク ${skippedA}件をスキップ`);
            }
            log(`Collected ${allJobs.length} job URLs from ${pageNum} pages`);
            return allJobs;

        } catch (error: any) {
            log(`Error collecting URLs: ${error.message}`);
            return allJobs;
        }
    }

    // 並列スクレイピング用: 個別の詳細ページをスクレイピング
    async scrapeJobDetail(page: Page, jobInfo: JobCardInfo, log?: (msg: string) => void): Promise<CompanyData | null> {
        const logFn = log || ((msg: string) => console.log(`[Rikunabi] ${msg}`));

        // リトライロジック
        let retries = 1;
        while (retries >= 0) {
            try {
                logFn(`Visiting: ${jobInfo.companyName || jobInfo.url}`);

                await page.goto(jobInfo.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
                await page.waitForTimeout(randomDelay(500, 1000));

            // 全フィールドを1回のpage.evaluate()で一括抽出
            const fields = await page.evaluate(() => {
                const result: Record<string, string> = {};

                // 求人タイトル
                const titleEl = document.querySelector('h1[class*="styles_heading"], h2[class*="styles_title"]');
                result.jobTitle = titleEl?.textContent?.trim() || '';

                // 会社名
                const companyLinkEl = document.querySelector('a[class*="styles_linkTextCompany"]');
                result.companyName = companyLinkEl?.textContent?.trim() || '';
                if (!result.companyName) {
                    const employerEl = document.querySelector('[class*="styles_employerName"]');
                    result.companyName = employerEl?.textContent?.trim() || '';
                }

                // 募集要項テーブル
                const appTable = document.querySelector('table[class*="styles_tableAboutApplication"]');
                if (appTable) {
                    const rows = appTable.querySelectorAll('tr[class*="styles_row"]');
                    for (const row of rows) {
                        const th = row.querySelector('th[class*="styles_title"]');
                        const td = row.querySelector('td[class*="styles_content"]');
                        if (th && td) {
                            const label = th.textContent?.trim() || '';
                            result[`job_${label}`] = td.textContent?.trim() || '';
                        }
                    }
                }

                // 企業情報テーブル（4つのフォールバックセレクター）
                const companySelectors = [
                    'tbody[class*="companyInfo"]',
                    'tbody[class*="styles_companyInfo"]',
                    'section:has(h2:text("企業情報"))',
                ];
                let companyRows: NodeListOf<Element> | null = null;
                for (const sel of companySelectors) {
                    try {
                        const container = document.querySelector(sel);
                        if (container) {
                            companyRows = container.querySelectorAll('tr');
                            break;
                        }
                    } catch { /* ignore */ }
                }

                // リンクから実際のURLを抽出するヘルパー
                const extractRealUrl = (td: Element): string | null => {
                    const link = td.querySelector('a[href^="http"]') as HTMLAnchorElement | null;
                    if (!link) return null;
                    // 直接の外部リンク
                    if (!link.href.includes('rikunabi.com')) return link.href;
                    // rikunabiリダイレクトURL → urlパラメータから実URLを抽出
                    try {
                        const url = new URL(link.href);
                        const redirectUrl = url.searchParams.get('url') || url.searchParams.get('redirect');
                        if (redirectUrl) return redirectUrl;
                    } catch { /* ignore */ }
                    // リンクテキストがURLの場合
                    const text = link.textContent?.trim() || '';
                    if (text.startsWith('http') && !text.includes('rikunabi.com')) return text;
                    return null;
                };

                if (companyRows) {
                    for (const row of companyRows) {
                        const th = row.querySelector('th h3, th[class*="title"], th');
                        const td = row.querySelector('td');
                        if (!th || !td) continue;
                        const label = th.textContent?.trim() || '';

                        const realUrl = extractRealUrl(td);
                        if (realUrl) {
                            result[`company_${label}`] = realUrl;
                        } else {
                            result[`company_${label}`] = td.textContent?.trim() || '';
                        }
                    }
                }

                // dt/ddパターンもフォールバック
                if (!companyRows || companyRows.length === 0) {
                    const dls = document.querySelectorAll('dl');
                    for (const dl of dls) {
                        const dts = dl.querySelectorAll('dt');
                        for (const dt of dts) {
                            const label = dt.textContent?.trim() || '';
                            if (!label) continue;
                            const dd = dt.nextElementSibling;
                            if (dd && dd.tagName === 'DD') {
                                const realUrl = extractRealUrl(dd);
                                if (realUrl) {
                                    result[`company_${label}`] = realUrl;
                                } else {
                                    result[`company_${label}`] = dd.textContent?.trim() || '';
                                }
                            }
                        }
                    }
                }

                // 企業HPフォールバック: HPのURLがまだ取れていない場合
                const hpKeys = ['company_企業ホームページ', 'company_企業HP', 'company_ホームページ', 'company_HP', 'company_WEBサイト', 'company_Webサイト', 'company_公式サイト'];
                const hasHpUrl = hpKeys.some(k => result[k] && (result[k] as string).startsWith('http'));
                if (!hasHpUrl) {
                    const hpLabels = ['企業HP', 'ホームページ', 'HP', '企業サイト', 'コーポレートサイト', '会社HP'];
                    for (const label of hpLabels) {
                        const ths = document.querySelectorAll('th');
                        for (const th of ths) {
                            if (th.textContent?.includes(label)) {
                                const tr = th.closest('tr');
                                if (tr) {
                                    const td = tr.querySelector('td');
                                    if (td) {
                                        const url = extractRealUrl(td);
                                        if (url) {
                                            result['company_企業HP'] = url;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (result['company_企業HP'] && (result['company_企業HP'] as string).startsWith('http')) break;
                    }
                }

                // __NEXT_DATA__から日付取得
                const scriptTag = document.querySelector('script#__NEXT_DATA__');
                if (scriptTag?.textContent) {
                    try {
                        const data = JSON.parse(scriptTag.textContent);
                        const timestamp = data?.props?.pageProps?.job?.lettice?.letticeLogBase?.datePublished
                            || data?.props?.pageProps?.jobData?.datePublished;
                        if (timestamp && typeof timestamp === 'number') {
                            result.datePublished = new Date(timestamp).toISOString();
                        }
                    } catch { /* ignore */ }
                }

                return result;
            });

            // 求人タイトル・会社名
            const jobTitle = jobInfo.jobTitle || fields.jobTitle || '';
            const companyName = jobInfo.companyName || fields.companyName || '';

            if (!companyName) {
                logFn('No company name found, skipping');
                return null;
            }

            const address = fields['company_本社所在地'] || fields['job_勤務地'] || '';
            const normalizedAddress = normalizeAddressUtil(address);
            const cleanName = cleanCompanyNameUtil(companyName);
            const homepageUrl = fields['company_企業ホームページ'] || fields['company_企業HP'] || fields['company_ホームページ'] || fields['company_HP'] || '';

                return {
                    source: this.source,
                    url: jobInfo.url,
                    company_name: cleanName,
                    job_title: jobTitle,
                    salary_text: normalizeSalary(fields['job_給与'] || undefined),
                    representative: fields['company_代表者'] || '',
                    establishment: fields['company_設立'] || '',
                    employees: normalizeEmployees(fields['company_従業員数'] || undefined),
                    revenue: fields['company_売上高'] || '',
                    phone: fields['company_企業代表番号'] || '',
                    address: normalizedAddress,
                    area: normalizeArea(extractPrefectureFromAddress(normalizedAddress)),
                    homepage_url: homepageUrl,
                    industry: normalizeIndustry(fields['company_事業内容'] || undefined),
                    scrape_status: 'step1_completed',
                    budget_rank: jobInfo.rank,
                    rank_confidence: jobInfo.rank === 'A' ? 0.9 : (jobInfo.rank === 'B' ? 0.7 : 0.6),
                    job_page_updated_at: fields.datePublished || null,
                };
            } catch (error: any) {
                retries--;
                if (retries >= 0) {
                    logFn(`Retry for ${jobInfo.companyName}: ${error.message}`);
                    await page.waitForTimeout(1000);
                } else {
                    logFn(`Failed ${jobInfo.companyName}: ${error.message}`);
                    return null;
                }
            }
        }
        return null;
    }
}
