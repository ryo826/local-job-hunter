import { Page, Locator } from 'playwright';
import { ScrapingStrategy, CompanyData, ScrapingParams, ScrapingCallbacks, BudgetRank, JobCardInfo } from './ScrapingStrategy';
import { normalizeIndustry, normalizeArea, normalizeSalary, normalizeEmployees } from '../utils/data-normalizer';

// ランダム待機時間のヘルパー関数
function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
// isJobFlairフラグ > ページ内表示順序
// リクナビは100件/ページ表示
async function classifyRikunabi(card: Locator, displayIndex: number, pageNum: number): Promise<RankResult> {
    try {
        // 1. isJobFlairフラグの検出を試みる
        // Job Flairオプションはカードにプレミアムなスタイリングが適用される
        // 通常、特別なクラス名やdata属性で判別可能
        const hasJobFlair = await card.locator('[class*="flair"], [class*="premium"], [class*="sponsored"]').count() > 0;

        // 絶対インデックスを計算（100件/ページ）
        const absoluteIndex = (pageNum - 1) * 100 + displayIndex;

        if (hasJobFlair) {
            return { rank: 'A', confidence: 0.9 };  // Job Flairオプション付き
        } else if (absoluteIndex < 100) {
            return { rank: 'B', confidence: 0.7 };  // 1ページ目(100件以内)
        } else {
            return { rank: 'C', confidence: 0.6 };  // 2ページ目以降
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

// リクナビNEXT職種カテゴリマッピング（英語名）
// URL形式: /oc-{英語名}/
const jobTypeCodes: Record<string, string> = {
    // サイト固有の名称
    '営業': 'selling',
    '企画/マーケティング': 'promotion',
    'コーポレートスタッフ': 'corporatestaff',
    'SCM/生産管理/購買/物流': 'scm',
    '事務/受付/秘書/翻訳': 'administration',
    '小売販売/流通': 'retail',
    'サービス/接客': 'hospitality',
    '飲食': 'foodservice',
    'コンサル/士業/リサーチャー': 'consulting',
    'IT・Web・ゲームエンジニア': 'it',
    'クリエイティブ/デザイン職': 'design',
    '建築/土木/プラント専門職': 'building',
    '不動産専門職': 'realestate',
    '機械/電気/電子製品専門職': 'electronic',
    '化学/素材専門職': 'chemicals',
    '化粧品/日用品/アパレル専門職': 'consumergoods',
    '医薬品専門職': 'pharmaceuticals',
    '医療機器/理化学機器専門職': 'medicaldevices',
    '医療/福祉専門職': 'medical',
    '金融専門職': 'financial',
    '食品/香料/飼料専門職': 'culinary',
    '出版/メディア/エンタメ専門職': 'broadcasting',
    'インフラ専門職': 'infrastructure',
    '交通/運輸/物流専門職': 'transportation',
    '人材サービス専門職': 'recruitment',
    '教育/保育専門職': 'instruction',
    'エグゼクティブ': 'executive',
    '学術研究': 'analysis',
    '公務員/団体職員/農林水産': 'publicsector',
    // SearchPage統一カテゴリからのエイリアス
    '営業・販売': 'selling',
    '経営・事業企画・人事・事務': 'corporatestaff',
    'モノづくりエンジニア': 'electronic',
    'コンサルタント・士業・金融': 'consulting',
    'サービス・販売・接客': 'hospitality',
    '不動産・建設': 'building',
    '物流・運輸・運転': 'transportation',
    '医療・福祉・介護': 'medical',
    'クリエイティブ・マスコミ': 'design',
    '教育・保育': 'instruction',
    'その他': 'publicsector',
};

export class RikunabiStrategy implements ScrapingStrategy {
    readonly source = 'rikunabi';

    // レート制限設定
    private readonly REQUEST_INTERVAL = 3000;  // 3秒
    private readonly PAGE_INTERVAL = 5000;     // 5秒

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
                    const normalizedAddress = this.normalizeAddress(address);
                    const cleanName = this.cleanCompanyName(companyName);

                    // 企業HPを複数のラベル名で検索
                    const homepageUrl = companyInfo['企業HP'] || companyInfo['ホームページ'] || companyInfo['HP'] || companyInfo['企業ホームページ'] || companyInfo['WEBサイト'] || companyInfo['Webサイト'] || companyInfo['公式サイト'] || '';

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
                        area: normalizeArea(this.extractAreaFromAddress(normalizedAddress)),
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
            // 企業情報tbody: tbody[class*="styles_companyInfo"]
            const companyTable = page.locator('tbody[class*="styles_companyInfo"]');
            if (await companyTable.count() === 0) {
                // 代替: 「企業情報」セクションを探す
                const companySection = page.locator('section:has(h2:has-text("企業情報"))');
                if (await companySection.count() > 0) {
                    const rows = await companySection.locator('tr[class*="styles_row"]').all();
                    for (const row of rows) {
                        try {
                            const labelEl = row.locator('th h3, th[class*="styles_title"]');
                            const label = (await labelEl.textContent())?.trim() || '';
                            if (!label) continue;

                            const contentEl = row.locator('td');

                            // リンクがある場合はhrefを取得
                            const linkEl = contentEl.locator('a');
                            if (await linkEl.count() > 0) {
                                const href = await linkEl.getAttribute('href');
                                // 外部リンクの場合はURLを保存
                                if (href && !href.includes('rikunabi.com')) {
                                    info[label] = href;
                                } else {
                                    info[label] = (await contentEl.textContent())?.trim() || '';
                                }
                            } else {
                                info[label] = (await contentEl.textContent())?.trim() || '';
                            }
                        } catch {
                            // 個別行のエラーは無視
                        }
                    }
                }
                return info;
            }

            // 企業情報行: tr[class*="styles_companyInfo"]
            const rows = await companyTable.locator('tr[class*="styles_companyInfo"], tr[class*="styles_row"]').all();

            for (const row of rows) {
                try {
                    // ラベル: th h3
                    const labelEl = row.locator('th h3, th[class*="styles_title"]');
                    if (await labelEl.count() === 0) continue;

                    const label = (await labelEl.textContent())?.trim() || '';
                    if (!label) continue;

                    // 内容: td
                    const contentEl = row.locator('td');
                    if (await contentEl.count() === 0) continue;

                    // リンクがある場合はhrefを取得 (企業HPなど)
                    const linkEl = contentEl.locator('a');
                    if (await linkEl.count() > 0) {
                        const href = await linkEl.getAttribute('href');
                        // 外部リンクの場合はURLを保存
                        if (href && !href.includes('rikunabi.com')) {
                            info[label] = href;
                        } else {
                            info[label] = (await contentEl.textContent())?.trim() || '';
                        }
                    } else {
                        info[label] = (await contentEl.textContent())?.trim() || '';
                    }
                } catch {
                    // 個別行のエラーは無視
                }
            }
        } catch (error: any) {
            log(`Error extracting company info: ${error.message}`);
        }

        return info;
    }

    // 住所の正規化
    private normalizeAddress(address: string | undefined): string | undefined {
        if (!address) return undefined;

        // 郵便番号を除去
        let normalized = address.replace(/〒?\d{3}-?\d{4}\s*/g, '').trim();
        normalized = normalized.replace(/\s+/g, ' ').trim();

        const prefectures = [
            '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
            '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
            '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
            '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
            '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
            '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
            '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
        ];

        for (const pref of prefectures) {
            const idx = normalized.indexOf(pref);
            if (idx !== -1) {
                return normalized.substring(idx);
            }
        }

        return normalized;
    }

    private cleanCompanyName(name: string): string {
        let cleaned = name
            // パイプ以降を削除
            .split(/[|｜]/)[0]
            // 【】内のプロモーション文を削除
            .replace(/【プライム市場】|【スタンダード市場】|【グロース市場】|【東証一部】|【東証二部】|【TOKYO PRO Market上場】/g, '')
            // グループ会社表記を削除
            .replace(/\(.*グループ.*\)/g, '')
            .replace(/（.*グループ.*）/g, '')
            // 全角英数字を半角に変換
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            // 全角スペースを半角に
            .replace(/　/g, ' ')
            // 余分な空白を整理
            .replace(/\s+/g, ' ')
            .trim();

        return cleaned;
    }

    private extractAreaFromAddress(address: string | undefined): string {
        if (!address) return '';

        const prefectures = [
            '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
            '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
            '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
            '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
            '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
            '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
            '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
        ];

        for (const pref of prefectures) {
            if (address.includes(pref)) {
                return pref;
            }
        }

        return '';
    }

    // 検索URLを構築するヘルパーメソッド
    // URL形式: https://next.rikunabi.com/job_search/area-{英語名}/oc-{職種英語名}/
    private buildSearchUrl(params: ScrapingParams): string {
        const { keywords, prefectures, jobTypes } = params;

        // パスベースのURL構築
        let pathParts: string[] = [];

        // 都道府県（最初の1つを使用）
        if (prefectures && prefectures.length > 0) {
            const areaCode = prefectureCodes[prefectures[0]];
            if (areaCode) {
                pathParts.push(`area-${areaCode}`);
            }
        }

        // 職種（最初の1つを使用）
        if (jobTypes && jobTypes.length > 0) {
            const jobCode = jobTypeCodes[jobTypes[0]];
            if (jobCode) {
                pathParts.push(`oc-${jobCode}`);
            }
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

        try {
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(randomDelay(2000, 3000));

            // 総件数を取得
            if (onTotalCount) {
                const countElement = page.locator('.styles_bodyText__KY7__, [class*="styles_bodyText"]').first();
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

            let hasNext = true;
            let pageNum = 0;
            const maxPages = 500;

            while (hasNext && pageNum < maxPages) {
                pageNum++;
                log(`Collecting URLs from page ${pageNum}...`);

                const jobCards = await page.locator('a[class*="styles_bigCard"]').all();
                log(`Found ${jobCards.length} job cards on page ${pageNum}`);

                if (jobCards.length === 0) break;

                for (let i = 0; i < jobCards.length; i++) {
                    try {
                        const card = jobCards[i];
                        const href = await card.getAttribute('href');
                        if (!href || !href.includes('/viewjob/')) continue;

                        const fullUrl = href.startsWith('http') ? href : `https://next.rikunabi.com${href}`;

                        // ランク判定
                        const hasJobFlair = await card.locator('[class*="flair"], [class*="premium"]').count() > 0;
                        const absoluteIndex = (pageNum - 1) * 100 + i;
                        const rank: BudgetRank = hasJobFlair ? 'A' : (absoluteIndex < 100 ? 'B' : 'C');

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
                            displayIndex: absoluteIndex,
                        });
                    } catch (err) {
                        // 個別エラーは無視
                    }
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
                            await page.waitForTimeout(randomDelay(2000, 3000));
                        } catch (error) {
                            hasNext = false;
                        }
                    }
                } else {
                    hasNext = false;
                }
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

        try {
            logFn(`Visiting: ${jobInfo.companyName || jobInfo.url}`);

            await page.goto(jobInfo.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(randomDelay(500, 1000));

            // 求人タイトルを取得
            let jobTitle = jobInfo.jobTitle;
            if (!jobTitle) {
                const titleEl = page.locator('h1[class*="styles_heading"], h2[class*="styles_title"]').first();
                if (await titleEl.count() > 0) {
                    jobTitle = (await titleEl.textContent())?.trim() || '';
                }
            }

            // 会社名を取得
            let companyName = jobInfo.companyName;
            if (!companyName) {
                const companyLinkEl = page.locator('a[class*="styles_linkTextCompany"]').first();
                if (await companyLinkEl.count() > 0) {
                    companyName = (await companyLinkEl.textContent())?.trim() || '';
                }
            }

            if (!companyName) {
                logFn('No company name found, skipping');
                return null;
            }

            // 募集要項と企業情報を抽出
            const jobDetails = await this.extractJobDetails(page, logFn);
            const companyInfo = await this.extractCompanyInfo(page, logFn);

            const address = companyInfo['本社所在地'] || jobDetails['勤務地'] || '';
            const normalizedAddress = this.normalizeAddress(address);
            const cleanName = this.cleanCompanyName(companyName);
            const homepageUrl = companyInfo['企業HP'] || companyInfo['ホームページ'] || companyInfo['HP'] || '';

            return {
                source: this.source,
                url: jobInfo.url,
                company_name: cleanName,
                job_title: jobTitle,
                salary_text: normalizeSalary(jobDetails['給与']),
                representative: companyInfo['代表者'] || '',
                establishment: companyInfo['設立'] || '',
                employees: normalizeEmployees(companyInfo['従業員数']),
                revenue: companyInfo['売上高'] || '',
                phone: companyInfo['企業代表番号'] || '',
                address: normalizedAddress,
                area: normalizeArea(this.extractAreaFromAddress(normalizedAddress)),
                homepage_url: homepageUrl,
                industry: normalizeIndustry(companyInfo['事業内容']),
                scrape_status: 'step1_completed',
                budget_rank: jobInfo.rank,
                rank_confidence: jobInfo.rank === 'A' ? 0.9 : (jobInfo.rank === 'B' ? 0.7 : 0.6),
                job_page_updated_at: (await extractRikunabiJobDate(page))?.toISOString() || null,
            };
        } catch (error: any) {
            logFn(`Error scraping ${jobInfo.companyName}: ${error.message}`);
            return null;
        }
    }
}
