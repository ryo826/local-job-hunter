import { Page, Locator } from 'playwright';
import { ScrapingStrategy, CompanyData, ScrapingParams, ScrapingCallbacks, BudgetRank, JobCardInfo } from './ScrapingStrategy';
import { normalizeIndustry, normalizeArea, normalizeSalary, normalizeEmployees } from '../utils/data-normalizer';
import {
    randomDelay,
    loadPageWithRetry,
    waitForAnySelector,
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

// 日付情報
interface JobPageDates {
    updateDate: Date | null;  // 情報更新日
    endDate: Date | null;     // 掲載終了予定日
}

// 日付文字列をパース（フォーマット: YYYY/MM/DD または YYYY/M/D）
function parseJapaneseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    try {
        // "2026/1/30" → "2026/01/30" に正規化
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        return new Date(year, month - 1, day);
    } catch {
        return null;
    }
}

// マイナビのカードから日付情報を抽出
async function extractMynaviJobDates(card: Locator): Promise<JobPageDates> {
    try {
        // プレミアム枠か通常枠かを判定
        const dataTy = await card.getAttribute('data-ty');
        const isPremium = dataTy === 'rzs';

        // セレクタを選択
        const updateSelector = isPremium
            ? '.cassetteRecruitRecommend__updateDate span, .cassetteRecruitRecommend__updateDate'
            : '.cassetteRecruit__updateDate span, .cassetteRecruit__updateDate';

        const endSelector = isPremium
            ? '.cassetteRecruitRecommend__endDate span, .cassetteRecruitRecommend__endDate'
            : '.cassetteRecruit__endDate span, .cassetteRecruit__endDate';

        // 更新日を取得
        let updateDate: Date | null = null;
        const updateDateEl = card.locator(updateSelector).first();
        if (await updateDateEl.count() > 0) {
            const updateDateText = await updateDateEl.textContent({ timeout: 2000 }).catch(() => null);
            if (updateDateText) {
                // "情報更新日:2026/1/30" や "2026/1/30" の形式をパース
                const match = updateDateText.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
                if (match) {
                    updateDate = parseJapaneseDate(match[1]);
                }
            }
        }

        // 掲載終了日を取得
        let endDate: Date | null = null;
        const endDateEl = card.locator(endSelector).first();
        if (await endDateEl.count() > 0) {
            const endDateText = await endDateEl.textContent({ timeout: 2000 }).catch(() => null);
            if (endDateText) {
                const match = endDateText.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
                if (match) {
                    endDate = parseJapaneseDate(match[1]);
                }
            }
        }

        return { updateDate, endDate };
    } catch {
        return { updateDate: null, endDate: null };
    }
}

// マイナビ転職のランク判定ロジック
// 実際のHTML調査結果に基づく判定:
// - 「注目」ラベル (.attention.box): 最上位プラン → A級 (0.17%のみ)
// - 「新着」ラベル (.new.box): 標準プラン → B級 (4%)
// - ラベルなし: 通常プラン → C級 (95.8%)
async function classifyMynavi(card: Locator, pageNum: number): Promise<RankResult> {
    try {
        // 1. 「注目」ラベルをチェック（最上位有料プラン）
        const hasAttentionBox = await card.locator('.attention.box').count() > 0;
        if (hasAttentionBox) {
            return { rank: 'A', confidence: 0.95 };  // 最上位プラン（確実）
        }

        // 2. 旧セレクターもフォールバックとしてチェック
        const dataTy = await card.getAttribute('data-ty');
        const hasAttentionLabel = await card.locator('.cassetteRecruitRecommend__label--attention').count() > 0;
        if (dataTy === 'rzs' || hasAttentionLabel) {
            return { rank: 'A', confidence: 0.9 };  // プレミアム枠
        }

        // 3. 「新着」ラベルをチェック（標準プラン）
        const hasNewBox = await card.locator('.new.box').count() > 0;
        if (hasNewBox) {
            return { rank: 'B', confidence: 0.8 };  // 新着（標準プラン）
        }

        // 4. ラベルなし（通常プラン）
        return { rank: 'C', confidence: 0.7 };  // 通常プラン

    } catch (error) {
        console.warn(`Rank classification failed: ${error}`);
        return { rank: 'C', confidence: 0.3 }; // デフォルトで最下位ランク
    }
}

// マイナビ都道府県マッピング（エリア + pコード）
// URL形式: https://tenshoku.mynavi.jp/{エリア}/list/p{コード}/
const prefectureMapping: Record<string, { area: string; code: string }> = {
    '北海道': { area: 'hokkaido', code: '' },  // 北海道は単独エリアのためコード不要
    '青森県': { area: 'tohoku', code: 'p02' },
    '岩手県': { area: 'tohoku', code: 'p03' },
    '宮城県': { area: 'tohoku', code: 'p04' },
    '秋田県': { area: 'tohoku', code: 'p05' },
    '山形県': { area: 'tohoku', code: 'p06' },
    '福島県': { area: 'tohoku', code: 'p07' },
    '茨城県': { area: 'kitakanto', code: 'p08' },
    '栃木県': { area: 'kitakanto', code: 'p09' },
    '群馬県': { area: 'kitakanto', code: 'p10' },
    '埼玉県': { area: 'shutoken', code: 'p11' },
    '千葉県': { area: 'shutoken', code: 'p12' },
    '東京都': { area: 'shutoken', code: 'p13' },
    '神奈川県': { area: 'shutoken', code: 'p14' },
    '新潟県': { area: 'koshinetsu', code: 'p15' },
    '富山県': { area: 'hokuriku', code: 'p16' },
    '石川県': { area: 'hokuriku', code: 'p17' },
    '福井県': { area: 'hokuriku', code: 'p18' },
    '山梨県': { area: 'koshinetsu', code: 'p19' },
    '長野県': { area: 'koshinetsu', code: 'p20' },
    '岐阜県': { area: 'tokai', code: 'p21' },
    '静岡県': { area: 'tokai', code: 'p22' },
    '愛知県': { area: 'tokai', code: 'p23' },
    '三重県': { area: 'tokai', code: 'p24' },
    '滋賀県': { area: 'kansai', code: 'p25' },
    '京都府': { area: 'kansai', code: 'p26' },
    '大阪府': { area: 'kansai', code: 'p27' },
    '兵庫県': { area: 'kansai', code: 'p28' },
    '奈良県': { area: 'kansai', code: 'p29' },
    '和歌山県': { area: 'kansai', code: 'p30' },
    '鳥取県': { area: 'chugoku', code: 'p31' },
    '島根県': { area: 'chugoku', code: 'p32' },
    '岡山県': { area: 'chugoku', code: 'p33' },
    '広島県': { area: 'chugoku', code: 'p34' },
    '山口県': { area: 'chugoku', code: 'p35' },
    '徳島県': { area: 'shikoku', code: 'p36' },
    '香川県': { area: 'shikoku', code: 'p37' },
    '愛媛県': { area: 'shikoku', code: 'p38' },
    '高知県': { area: 'shikoku', code: 'p39' },
    '福岡県': { area: 'kyushu', code: 'p40' },
    '佐賀県': { area: 'kyushu', code: 'p41' },
    '長崎県': { area: 'kyushu', code: 'p42' },
    '熊本県': { area: 'kyushu', code: 'p43' },
    '大分県': { area: 'kyushu', code: 'p44' },
    '宮崎県': { area: 'kyushu', code: 'p45' },
    '鹿児島県': { area: 'kyushu', code: 'p46' },
    '沖縄県': { area: 'kyushu', code: 'p47' },
};

// マイナビ職種コードマッピング
// URL形式: /o{コード}/
const jobTypeCodes: Record<string, string> = {
    // サイト固有の名称
    '営業': 'o11',
    '販売・フード・アミューズメント': 'o12',
    '医療・福祉': 'o13',
    '企画・経営': 'o14',
    '建築・土木': 'o15',
    'ITエンジニア': 'o16',
    '電気・電子・機械・半導体': 'o17',
    '医薬・食品・化学・素材': 'o18',
    'コンサルタント・金融・不動産専門職': 'o19',
    'クリエイティブ': 'o1A',
    '技能工・設備・配送・農林水産 他': 'o1B',
    '公共サービス': 'o1C',
    '管理・事務': 'o1D',
    '美容・ブライダル・ホテル・交通': 'o1E',
    '保育・教育・通訳': 'o1F',
    'WEB・インターネット・ゲーム': 'o1G',
    // 15統合カテゴリからのエイリアス
    '営業・販売・カスタマー対応': 'o11',           // ① 営業
    '企画・マーケティング・経営': 'o14',           // ② 企画・経営
    '事務・管理・アシスタント': 'o1D',             // ③ 管理・事務
    'ITエンジニア・Web・ゲーム': 'o16',            // ④ ITエンジニア
    '電気・電子・機械・半導体・制御': 'o17',       // ⑤ 電気・電子・機械・半導体
    '化学・素材・食品・医薬': 'o18',               // ⑥ 医薬・食品・化学・素材
    '建築・土木・設備・プラント・不動産技術': 'o15', // ⑦ 建築・土木
    'クリエイティブ・デザイン': 'o1A',             // ⑧ クリエイティブ
    'コンサルタント・専門職': 'o19',               // ⑨ コンサルタント・金融・不動産専門職
    '金融専門職': 'o19',                           // ⑩ コンサルタント・金融・不動産専門職（金融部分）
    '医療・介護・福祉': 'o13',                     // ⑪ 医療・福祉
    '教育・保育・公共サービス': 'o1F',             // ⑫ 保育・教育・通訳
    'サービス・外食・レジャー・美容・ホテル・交通': 'o1E', // ⑬ 美容・ブライダル・ホテル・交通
    '物流・運輸・技能工・設備・製造': 'o1B',       // ⑭ 技能工・設備・配送・農林水産 他
    '公務員・団体職員・その他': 'o1C',             // ⑮ 公共サービス
};

// 求人カードのセレクター候補（優先順位順）
const JOB_CARD_SELECTORS = [
    '.recruitList__item',             // 新しいHTML構造
    '.recruit',                       // シンプルなrecruitクラス
    'div.recruit',
    '.cassetteRecruitRecommend__content',
    '.cassetteRecruit__content',
    '.cassetteRecruit',
    '[class*="cassetteRecruit"]',
    'article[class*="recruit"]',
    '[class*="recruitCard"]',
    '[class*="jobCard"]',
    '.searchResultItem',
];

// 求人詳細リンクのセレクター候補
const JOB_LINK_SELECTORS = [
    'a[href*="/jobinfo-"]',  // 実際のHTML: //tenshoku.mynavi.jp/jobinfo-405430-1-7-1/
    '.recruit a[href*="/jobinfo"]',
    'a.linkArrowS',          // 「求人詳細を見る」リンク
    'a.js__ga--setCookieOccName',  // 求人タイトルリンク
    'a[href*="/jobinfo/"]',
    'a[href*="/msg/"]',
];

// 会社名セレクター候補
const COMPANY_NAME_SELECTORS = [
    '.recruit_company_name',          // 新しいHTML構造
    '.recruit_company',
    'h3.cassetteRecruitRecommend__name',
    '.cassetteRecruitRecommend__name',
    '.cassetteRecruit__name',
    '.companyName',
    '[class*="companyName"]',
    '[class*="company_name"]',
    '.main_title',                    // "会社名 | 求人タイトル" 形式（|の左側が会社名）
];

// 求人タイトルセレクター候補
const JOB_TITLE_SELECTORS = [
    '.recruit_job_title',             // 新しいHTML構造
    '.recruit_title',
    '.cassetteRecruitRecommend__copy a',
    'p.cassetteRecruitRecommend__copy a',
    '.cassetteRecruit__copy a',
    '.cassetteRecruit__heading',
    'h2 a',
    'h3 a',
];

export class MynaviStrategy implements ScrapingStrategy {
    readonly source = 'mynavi';

    // レート制限設定
    private readonly REQUEST_INTERVAL = 3000;  // 3秒
    private readonly PAGE_INTERVAL = 5000;     // 5秒

    async *scrape(page: Page, params: ScrapingParams, callbacks?: ScrapingCallbacks): AsyncGenerator<CompanyData> {
        const { onLog, onTotalCount } = callbacks || {};

        const log = (msg: string) => {
            if (onLog) onLog(msg);
            else console.log(`[Mynavi] ${msg}`);
        };

        // 検索結果ページのURLを構築
        const searchUrl = this.buildSearchUrl(params);

        log(`Navigating to: ${searchUrl}`);

        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(randomDelay(2000, 5000)); // 2-5秒のランダム待機
        } catch (error) {
            log(`Error loading search page: ${error}`);
            return;
        }

        // 求人カードの出現を待機（複数のセレクターを試行）
        log('Waiting for job cards to appear...');
        const cardSelector = await waitForAnySelector(page, JOB_CARD_SELECTORS, 15000, log);
        if (!cardSelector) {
            log('ERROR: No job cards found with any known selector');
            log('Available selectors tried: ' + JOB_CARD_SELECTORS.join(', '));

            // デバッグ用：ページの主要な要素を確認
            const debugInfo = await this.getPageDebugInfo(page);
            log(`Debug info: ${debugInfo}`);
            return;
        }
        log(`Using card selector: ${cardSelector}`);

        // 総件数を取得してコールバックで報告
        if (onTotalCount) {
            try {
                // 複数のセレクターを試行
                const countSelectors = [
                    '.js__searchRecruit--count',
                    '.result__num',
                    '.search__result__num',
                    '[class*="searchResult"] [class*="num"]',
                    '.countNum',
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
                                const num = parseInt(match[1].replace(/,/g, ''), 10);
                                if (!isNaN(num) && num > 0) {
                                    log(`Total jobs: ${num}`);
                                    onTotalCount(num);
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

        let hasNext = true;
        let pageNum = 0;
        const maxPages = 500;  // 制限を緩和
        let currentSearchUrl = searchUrl;

        while (hasNext && pageNum < maxPages) {
            pageNum++;
            log(`Scraping page ${pageNum}...`);

            // 求人カードを取得
            const jobCards = await page.locator(cardSelector).all();
            log(`Found ${jobCards.length} job cards`);

            if (jobCards.length === 0) {
                log('No job cards found on this page, stopping');
                break;
            }

            // 各カードからURLリストを先に抽出（ページ遷移しても失われないように）
            const jobUrls: { url: string; companyName: string; jobTitle: string; rankResult: RankResult; dates: JobPageDates }[] = [];

            for (const card of jobCards) {
                // ランク判定
                const rankResult = await classifyMynavi(card, pageNum);
                // 日付情報を抽出
                const dates = await extractMynaviJobDates(card);
                try {
                    // リンクを取得（複数のセレクターを試行）
                    let url: string | null = null;
                    for (const linkSelector of JOB_LINK_SELECTORS) {
                        const linkEl = card.locator(linkSelector).first();
                        if (await linkEl.count() > 0) {
                            url = await linkEl.getAttribute('href');
                            if (url) break;
                        }
                    }

                    if (!url) {
                        // フォールバック: カード内の最初のリンクを取得
                        const anyLink = card.locator('a[href]').first();
                        if (await anyLink.count() > 0) {
                            url = await anyLink.getAttribute('href');
                        }
                    }

                    if (!url || url.includes('javascript:')) {
                        continue;
                    }

                    // URL正規化: 二重ドメインや不正なパスを修正
                    let fullUrl: string;
                    if (url.startsWith('http')) {
                        fullUrl = url;
                    } else if (url.startsWith('//')) {
                        // プロトコル相対URL (//tenshoku.mynavi.jp/...)
                        fullUrl = `https:${url}`;
                    } else if (url.includes('tenshoku.mynavi.jp')) {
                        // ドメインが含まれているが http:// がない場合
                        const match = url.match(/tenshoku\.mynavi\.jp(\/.*)/);
                        if (match) {
                            fullUrl = `https://tenshoku.mynavi.jp${match[1]}`;
                        } else {
                            fullUrl = `https://${url.replace(/^\/+/, '')}`;
                        }
                    } else {
                        // 相対パス
                        fullUrl = `https://tenshoku.mynavi.jp${url.startsWith('/') ? '' : '/'}${url}`;
                    }

                    // マイナビ以外のURLはスキップ
                    if (!fullUrl.includes('mynavi.jp')) {
                        continue;
                    }

                    // /msg/ URLを通常の詳細ページURLに変換
                    // 例: /jobinfo-143434-1-104-1/msg/ → /jobinfo-143434-1-104-1/
                    if (fullUrl.includes('/msg/')) {
                        fullUrl = fullUrl.replace(/\/msg\/?$/, '/');
                    }

                    // 会社名を取得
                    let companyName = '';
                    for (const nameSelector of COMPANY_NAME_SELECTORS) {
                        const nameEl = card.locator(nameSelector).first();
                        if (await nameEl.count() > 0) {
                            companyName = (await nameEl.textContent())?.trim() || '';
                            if (companyName) break;
                        }
                    }

                    // 求人タイトルを取得
                    let jobTitle = '';
                    for (const titleSelector of JOB_TITLE_SELECTORS) {
                        const titleEl = card.locator(titleSelector).first();
                        if (await titleEl.count() > 0) {
                            jobTitle = (await titleEl.textContent())?.trim() || '';
                            if (jobTitle) break;
                        }
                    }

                    jobUrls.push({ url: fullUrl, companyName, jobTitle, rankResult, dates });
                } catch (err) {
                    log(`Error extracting job URL from card: ${err}`);
                }
            }

            log(`Extracted ${jobUrls.length} valid job URLs (Page ${pageNum})`);

            // 各求人詳細ページを訪問
            for (const jobInfo of jobUrls) {
                try {
                    log(`Visiting: ${jobInfo.url}`);
                    await page.waitForTimeout(this.REQUEST_INTERVAL); // レート制限

                    await page.goto(jobInfo.url, { waitUntil: 'networkidle', timeout: 30000 });
                    await page.waitForTimeout(randomDelay(2000, 5000)); // 2-5秒待機

                    // 404チェック
                    const is404 = await page.locator('text=/404|ページが見つかりません|お探しのページは|掲載が終了/i').count() > 0;
                    if (is404) {
                        log('Page not found or job expired, skipping');
                        continue;
                    }

                    // 企業情報を抽出
                    const companyUrl = await this.extractCompanyUrl(page);
                    const address = await this.extractTableValue(page, '本社所在地') ||
                        await this.extractTableValue(page, '勤務地') ||
                        await this.extractTableValue(page, '所在地');
                    const industry = await this.extractTableValue(page, '事業内容') ||
                        await this.extractTableValue(page, '業種');
                    const employees = await this.extractTableValue(page, '従業員数');
                    const establishment = await this.extractTableValue(page, '設立');
                    const representative = await this.extractTableValue(page, '代表者');
                    const revenue = await this.extractTableValue(page, '売上高');
                    const phone = await this.extractTableValue(page, '電話番号');
                    const salaryText = await this.extractTableValue(page, '給与') ||
                        await this.extractTableValue(page, '年収') ||
                        await this.extractTableValue(page, '想定年収');

                    // 会社名が空の場合はページから取得を試みる
                    let companyName = jobInfo.companyName;
                    if (!companyName) {
                        const pageCompanyEl = page.locator('.companyName, [class*="company-name"], h1 + p, .recruiter').first();
                        if (await pageCompanyEl.count() > 0) {
                            companyName = (await pageCompanyEl.textContent())?.trim() || '';
                        }
                    }

                    // 求人タイトルが空の場合はページから取得を試みる
                    let jobTitle = jobInfo.jobTitle;
                    if (!jobTitle) {
                        const pageTitleEl = page.locator('h1, .jobTitle, [class*="job-title"]').first();
                        if (await pageTitleEl.count() > 0) {
                            jobTitle = (await pageTitleEl.textContent())?.trim() || '';
                        }
                    }

                    // 求人内容を抽出（要素が存在する場合のみ）
                    let jobDescription = '';
                    const jobDescriptionEl = page.locator('.jobDescriptionText, [class*="description"], .recruitContents, [class*="job-detail"]').first();
                    if (await jobDescriptionEl.count() > 0) {
                        jobDescription = (await jobDescriptionEl.textContent())?.trim().substring(0, 500) || '';
                    }

                    // 住所の正規化
                    const normalizedAddress = normalizeAddressUtil(address);

                    const cleanName = cleanCompanyNameUtil(companyName);

                    // Note: 電話番号はGoogle Maps APIで後から取得するため、Step 2はスキップ
                    // スクレイピング速度が大幅に向上

                    yield {
                        source: this.source,
                        url: jobInfo.url,
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: normalizeSalary(salaryText),
                        representative,
                        establishment,
                        employees: normalizeEmployees(employees),
                        revenue,
                        phone: phone, // 求人ページのテーブルから取得できた場合のみ
                        address: normalizedAddress,
                        area: normalizeArea(extractPrefectureFromAddress(normalizedAddress)),
                        homepage_url: companyUrl,
                        industry: normalizeIndustry(industry),
                        job_description: jobDescription,
                        scrape_status: 'step1_completed',
                        // ランク情報
                        budget_rank: jobInfo.rankResult.rank,
                        rank_confidence: jobInfo.rankResult.confidence,
                        // 求人ページ更新日情報
                        job_page_updated_at: jobInfo.dates.updateDate?.toISOString() || null,
                        job_page_end_date: jobInfo.dates.endDate?.toISOString() || null,
                    };

                } catch (err) {
                    log(`Error scraping job: ${err}`);
                    continue;
                }
            }

            // 次のページへ（URLを直接使用してナビゲート）
            await page.waitForTimeout(this.PAGE_INTERVAL);

            // 検索結果ページに戻る
            log('Returning to search results...');
            await page.goto(currentSearchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(randomDelay(2000, 4000));

            // 次ページボタンを探す
            const nextButton = page.locator('a:has-text("次へ"), .pager__next a, a[rel="next"], [class*="pagination"] a:has-text("次"), a.next').first();
            if (await nextButton.count() > 0 && await nextButton.isVisible()) {
                try {
                    const nextUrl = await nextButton.getAttribute('href');
                    if (nextUrl) {
                        // ページ番号を抽出 (例: /list/pg2/ -> pg2)
                        const pageMatch = nextUrl.match(/pg(\d+)/);
                        if (pageMatch) {
                            // 元のsearchUrlにページ番号を追加して検索条件を保持
                            const url = new URL(searchUrl);
                            // パス部分にページ番号を挿入 (/list/ -> /list/pg2/)
                            if (!url.pathname.includes('/pg')) {
                                url.pathname = url.pathname.replace(/\/$/, '') + `/pg${pageMatch[1]}/`;
                            } else {
                                url.pathname = url.pathname.replace(/pg\d+/, `pg${pageMatch[1]}`);
                            }
                            currentSearchUrl = url.toString();
                        } else {
                            // ページ番号が見つからない場合は従来の方法
                            let fullNextUrl: string;
                            if (nextUrl.startsWith('http')) {
                                fullNextUrl = nextUrl;
                            } else if (nextUrl.startsWith('//')) {
                                fullNextUrl = `https:${nextUrl}`;
                            } else if (nextUrl.startsWith('/')) {
                                fullNextUrl = `https://tenshoku.mynavi.jp${nextUrl}`;
                            } else {
                                fullNextUrl = `https://tenshoku.mynavi.jp/${nextUrl}`;
                            }
                            // 元のクエリパラメータを追加
                            const originalUrl = new URL(searchUrl);
                            const nextUrlObj = new URL(fullNextUrl);
                            originalUrl.searchParams.forEach((value, key) => {
                                if (!nextUrlObj.searchParams.has(key)) {
                                    nextUrlObj.searchParams.set(key, value);
                                }
                            });
                            currentSearchUrl = nextUrlObj.toString();
                        }
                        log(`Navigating to next page: ${currentSearchUrl}`);
                        await page.goto(currentSearchUrl, { waitUntil: 'networkidle', timeout: 30000 });
                        await page.waitForTimeout(randomDelay(3000, 5000));
                    } else {
                        // hrefがない場合はクリック
                        await nextButton.click();
                        await page.waitForLoadState('networkidle');
                        await page.waitForTimeout(randomDelay(3000, 5000));
                        currentSearchUrl = page.url();
                    }
                } catch (error) {
                    log(`Error navigating to next page: ${error}`);
                    hasNext = false;
                }
            } else {
                log('No next page button found');
                hasNext = false;
            }
        }

        log(`Completed scraping ${pageNum} pages`);
    }

    // デバッグ用：ページの主要要素情報を取得
    private async getPageDebugInfo(page: Page): Promise<string> {
        try {
            return await page.evaluate(() => {
                const info: string[] = [];
                info.push(`URL: ${window.location.href}`);
                info.push(`Title: ${document.title}`);

                // 主要なclass名を収集
                const classes = new Set<string>();
                document.querySelectorAll('*').forEach(el => {
                    if (el.className && typeof el.className === 'string') {
                        el.className.split(' ').slice(0, 3).forEach(c => {
                            if (c && (c.includes('recruit') || c.includes('job') || c.includes('cassette') || c.includes('card') || c.includes('list'))) {
                                classes.add(c);
                            }
                        });
                    }
                });
                info.push(`Relevant classes: ${Array.from(classes).slice(0, 10).join(', ')}`);

                return info.join(' | ');
            });
        } catch {
            return 'Could not get debug info';
        }
    }

    // 企業URLを抽出（複数箇所をチェック）
    private async extractCompanyUrl(page: Page): Promise<string | undefined> {
        try {
            // 方法1: 企業ホームページのテーブル行から取得（tr経由でtdを取得）
            // HTMLの実際の構造: <tr><th>企業ホームページ</th><td><a>https://example.com/</a></td></tr>
            const homepageTh = page.locator('th.jobOfferTable__head:has-text("企業ホームページ")').first();
            if (await homepageTh.count() > 0) {
                // 親のtrを取得し、その中のtdを探す
                const parentTr = homepageTh.locator('xpath=..');
                if (await parentTr.count() > 0) {
                    const tdEl = parentTr.locator('td.jobOfferTable__body').first();
                    if (await tdEl.count() > 0) {
                        const linkEl = tdEl.locator('a').first();
                        if (await linkEl.count() > 0) {
                            // リンクのテキスト内容が実際のURL
                            const urlText = (await linkEl.textContent())?.trim();
                            if (urlText && urlText.startsWith('http')) {
                                return urlText;
                            }
                            // hrefからも試す（リダイレクトURLの場合があるため最終手段）
                            const href = await linkEl.getAttribute('href');
                            if (href && !href.includes('mynavi.jp') && href.startsWith('http')) {
                                return href;
                            }
                        }
                        // リンクがない場合、テキストがURLかもしれない
                        const text = (await tdEl.textContent())?.trim();
                        if (text && text.startsWith('http') && !text.includes('mynavi.jp')) {
                            return text;
                        }
                    }
                }
            }

            // 方法2: 会社概要テーブルの「企業HP」「HP」行（tr経由でtdを取得）
            const hpLabels = ['企業HP', 'HP', 'ホームページ', 'URL', '公式サイト', 'WEBサイト'];
            for (const label of hpLabels) {
                // thパターン
                const thEl = page.locator(`th:has-text("${label}")`).first();
                if (await thEl.count() > 0) {
                    const parentTr = thEl.locator('xpath=..');
                    if (await parentTr.count() > 0) {
                        const tdEl = parentTr.locator('td').first();
                        if (await tdEl.count() > 0) {
                            const linkEl = tdEl.locator('a').first();
                            if (await linkEl.count() > 0) {
                                const urlText = (await linkEl.textContent())?.trim();
                                if (urlText && urlText.startsWith('http') && !urlText.includes('mynavi.jp')) {
                                    return urlText;
                                }
                            }
                            // リンクがない場合、テキストがURLかもしれない
                            const text = (await tdEl.textContent())?.trim();
                            if (text && text.startsWith('http') && !text.includes('mynavi.jp')) {
                                return text;
                            }
                        }
                    }
                }
                // dt/ddパターン
                const dtEl = page.locator(`dt:has-text("${label}")`).first();
                if (await dtEl.count() > 0) {
                    const parentDl = dtEl.locator('xpath=..');
                    const ddEl = parentDl.locator(`dt:has-text("${label}") + dd`).first();
                    if (await ddEl.count() > 0) {
                        const linkEl = ddEl.locator('a').first();
                        if (await linkEl.count() > 0) {
                            const urlText = (await linkEl.textContent())?.trim();
                            if (urlText && urlText.startsWith('http') && !urlText.includes('mynavi.jp')) {
                                return urlText;
                            }
                        }
                        const text = (await ddEl.textContent())?.trim();
                        if (text && text.startsWith('http') && !text.includes('mynavi.jp')) {
                            return text;
                        }
                    }
                }
            }

            // 方法3: 一般的な企業ホームページリンク
            const homepageLink = page.locator('a:has-text("企業ホームページ"), a:has-text("コーポレートサイト")').first();
            if (await homepageLink.count() > 0) {
                const text = (await homepageLink.textContent())?.trim();
                if (text && text.startsWith('http')) {
                    return text;
                }
            }

            // 方法4: 会社概要セクションのリンク
            const companySection = page.locator('.jobOfferTable, .companyData, .company-info, [class*="company"]');
            const links = await companySection.locator('a[href^="http"]').all();
            for (const link of links) {
                const href = await link.getAttribute('href');
                if (href && !href.includes('mynavi.jp') && !href.includes('google.com')) {
                    // 外部リンクが企業URLの可能性
                    return href;
                }
            }

            // 方法5: ページ全体から企業URLを探す（最終手段）
            const result = await page.evaluate(() => {
                // 全てのリンクを検索
                const allLinks = document.querySelectorAll('a[href]');
                for (const link of allLinks) {
                    const href = (link as HTMLAnchorElement).href;
                    const text = link.textContent?.trim() || '';

                    // mynavi以外の外部URLで、URLがテキストに含まれている場合
                    if (href &&
                        !href.includes('mynavi.jp') &&
                        !href.includes('google.com') &&
                        !href.includes('javascript:') &&
                        text.startsWith('http')) {
                        return text;
                    }
                }
                return null;
            });

            if (result) return result;

        } catch (error) {
            // エラーは無視
        }

        return undefined;
    }

    // テーブル形式のデータを抽出（tr経由でtdを取得）
    private async extractTableValue(page: Page, label: string): Promise<string | undefined> {
        // マイナビの実際の構造: th.jobOfferTable__head / td.jobOfferTable__body > div.text
        const jobOfferTh = page.locator(`th.jobOfferTable__head:has-text("${label}")`).first();
        if (await jobOfferTh.count() > 0) {
            // 親のtrを取得し、その中のtdを探す
            const parentTr = jobOfferTh.locator('xpath=..');
            if (await parentTr.count() > 0) {
                const tdEl = parentTr.locator('td.jobOfferTable__body').first();
                if (await tdEl.count() > 0) {
                    // div.text 内のテキストを取得
                    const textEl = tdEl.locator('.text').first();
                    if (await textEl.count() > 0) {
                        return (await textEl.textContent())?.trim() || undefined;
                    }
                    // div.text がない場合は td 直下のテキスト
                    return (await tdEl.textContent())?.trim() || undefined;
                }
            }
        }

        // 一般的な th/td パターン（tr経由）
        const thEl = page.locator(`th:has-text("${label}")`).first();
        if (await thEl.count() > 0) {
            const parentTr = thEl.locator('xpath=..');
            if (await parentTr.count() > 0) {
                const tdEl = parentTr.locator('td').first();
                if (await tdEl.count() > 0) {
                    return (await tdEl.textContent())?.trim() || undefined;
                }
            }
        }

        // dt/dd パターン（隣接セレクター使用）
        const dtEl = page.locator(`dt:has-text("${label}")`).first();
        if (await dtEl.count() > 0) {
            const ddEl = page.locator(`dt:has-text("${label}") + dd`).first();
            if (await ddEl.count() > 0) {
                return (await ddEl.textContent())?.trim() || undefined;
            }
        }

        return undefined;
    }

    // 検索URLを構築するヘルパーメソッド
    // URL形式: https://tenshoku.mynavi.jp/{エリア}/list/p{都道府県コード}/o{職種コード}/only/min{年収}/emin{従業員数}/new/?ags=0
    // /only/ を付けないと指定した地域以外の求人も含まれてしまう
    private buildSearchUrl(params: ScrapingParams): string {
        const { keywords, prefectures, jobTypes, minSalary, minEmployees, newPostsOnly } = params;

        // ベースURL構築
        let basePath = '';
        let prefCode = '';

        // 都道府県からエリアとコードを取得（最初の1つを使用）
        if (prefectures && prefectures.length > 0) {
            const pref = prefectures[0];
            const mapping = prefectureMapping[pref];
            if (mapping) {
                basePath = mapping.area;
                prefCode = mapping.code;
            }
        }

        // 職種コードを取得（最初の1つを使用）
        let jobCode = '';
        if (jobTypes && jobTypes.length > 0) {
            const jt = jobTypes[0];
            jobCode = jobTypeCodes[jt] || '';
        }

        // URL構築
        let searchUrl = 'https://tenshoku.mynavi.jp/';

        if (basePath) {
            searchUrl += `${basePath}/list/`;
            if (prefCode) {
                searchUrl += `${prefCode}/`;
            }
            if (jobCode) {
                searchUrl += `${jobCode}/`;
            }
            // /only/ を職種コードの後に追加して指定地域のみに限定
            searchUrl += 'only/';
        } else {
            // 条件なしの場合はベースリストURL
            searchUrl += 'list/';
            if (jobCode) {
                searchUrl += `${jobCode}/`;
            }
        }

        // 年収フィルター（例: min0500 = 500万円以上）
        if (minSalary && minSalary > 0) {
            const salaryCode = String(minSalary).padStart(4, '0');
            searchUrl += `min${salaryCode}/`;
        }

        // 従業員数フィルター（例: emin0100 = 100名以上）
        if (minEmployees && minEmployees > 0) {
            const empCode = String(minEmployees).padStart(4, '0');
            searchUrl += `emin${empCode}/`;
        }

        // 新着求人フィルター
        if (newPostsOnly) {
            searchUrl += 'new/';
        }

        // クエリパラメータ構築
        const queryParams: string[] = [];

        // キーワード検索
        if (keywords) {
            queryParams.push(`searchKeyword=${encodeURIComponent(keywords)}`);
        }

        // ags=0 パラメータ（常に追加）
        queryParams.push('ags=0');

        if (queryParams.length > 0) {
            searchUrl += `?${queryParams.join('&')}`;
        }

        return searchUrl;
    }

    // 総求人件数を取得
    async getTotalJobCount(page: Page, params: ScrapingParams): Promise<number | undefined> {
        try {
            const searchUrl = this.buildSearchUrl(params);
            await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000);

            // マイナビの検索結果件数を取得
            // セレクタ: span.total_txt.total_num (カンマ区切り数字: 2,738)
            const selectors = [
                'span.total_txt.total_num',
                '.total_txt.total_num',
                '.js__searchRecruit--count',
            ];

            for (const selector of selectors) {
                const element = page.locator(selector).first();
                if (await element.count() > 0) {
                    const text = await element.textContent();
                    if (text) {
                        const num = parseInt(text.replace(/,/g, ''), 10);
                        if (!isNaN(num)) {
                            return num;
                        }
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
        const log = (msg: string) => onLog ? onLog(msg) : console.log(`[Mynavi] ${msg}`);

        const searchUrl = this.buildSearchUrl(params);
        log(`Collecting job URLs from: ${searchUrl}`);

        const allJobs: JobCardInfo[] = [];

        // HTTP/2エラー対策: リトライロジック
        let retries = 3;
        let pageLoaded = false;
        let cardSelector: string | null = null;

        while (retries > 0 && !pageLoaded) {
            try {
                await page.setExtraHTTPHeaders({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                });

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(randomDelay(1000, 2000));

                // カードセレクターを取得
                cardSelector = await waitForAnySelector(page, JOB_CARD_SELECTORS, 10000, log);
                if (!cardSelector) {
                    log('No job cards found');
                    return allJobs;
                }
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

            // 総件数を取得
            // セレクタ: span.total_txt.total_num (カンマ区切り数字: 2,738)
            if (onTotalCount) {
                const selectors = [
                    'span.total_txt.total_num',
                    '.total_txt.total_num',
                    '.js__searchRecruit--count',
                ];
                for (const selector of selectors) {
                    const countElement = page.locator(selector).first();
                    if (await countElement.count() > 0) {
                        const text = await countElement.textContent();
                        if (text) {
                            const num = parseInt(text.replace(/,/g, ''), 10);
                            if (!isNaN(num)) {
                                log(`Total jobs: ${num}`);
                                onTotalCount(num);
                                break;
                            }
                        }
                    }
                }
            }

            // ランクフィルターの設定
            // Mynaviのランク: A=注目ラベル, B=新着ラベル, C=ラベルなし
            const rankFilter = params.rankFilter;
            const includeA = !rankFilter || rankFilter.length === 0 || rankFilter.includes('A');
            const includeB = !rankFilter || rankFilter.length === 0 || rankFilter.includes('B');
            const includeC = !rankFilter || rankFilter.length === 0 || rankFilter.includes('C');

            if (rankFilter && rankFilter.length > 0) {
                log(`ランクフィルター: ${rankFilter.join(', ')} (A=${includeA}, B=${includeB}, C=${includeC})`);
            }

            // スキップカウント
            let skippedA = 0;
            let skippedB = 0;
            let skippedC = 0;

            let hasNext = true;
            let pageNum = 0;
            let globalIndex = 0;
            const maxPages = 500;

            while (hasNext && pageNum < maxPages) {
                pageNum++;
                log(`Collecting URLs from page ${pageNum}...`);

                // page.evaluate()で全カード情報を一括取得（大幅高速化）
                const pageCards = await page.evaluate((args) => {
                    const { selector, linkSelectors, nameSelectors, titleSelectors } = args;
                    const cards = document.querySelectorAll(selector);
                    return Array.from(cards).map(card => {
                        // ランク判定
                        const hasAttentionBox = card.querySelector('.attention.box') !== null;
                        const dataTy = card.getAttribute('data-ty');
                        const hasAttentionLabel = card.querySelector('.cassetteRecruitRecommend__label--attention') !== null;
                        const hasNewBox = card.querySelector('.new.box') !== null;

                        let rank: 'A' | 'B' | 'C';
                        if (hasAttentionBox || dataTy === 'rzs' || hasAttentionLabel) {
                            rank = 'A';
                        } else if (hasNewBox) {
                            rank = 'B';
                        } else {
                            rank = 'C';
                        }

                        // URL取得
                        let url: string | null = null;
                        for (const sel of linkSelectors) {
                            const el = card.querySelector(sel);
                            if (el) {
                                url = el.getAttribute('href');
                                if (url) break;
                            }
                        }

                        // 会社名取得
                        let companyName = '';
                        for (const sel of nameSelectors) {
                            const el = card.querySelector(sel);
                            if (el) {
                                let text = (el.textContent || '').trim();
                                // .main_title の場合: "会社名 | 求人タイトル" 形式
                                if (sel === '.main_title' && text.includes('|')) {
                                    text = text.split('|')[0].trim();
                                }
                                companyName = text;
                                if (companyName) break;
                            }
                        }

                        // 求人タイトル取得
                        let jobTitle = '';
                        for (const sel of titleSelectors) {
                            const el = card.querySelector(sel);
                            if (el) {
                                jobTitle = (el.textContent || '').trim();
                                if (jobTitle) break;
                            }
                        }

                        return { url, companyName, jobTitle, rank };
                    });
                }, {
                    selector: cardSelector,
                    linkSelectors: JOB_LINK_SELECTORS,
                    nameSelectors: COMPANY_NAME_SELECTORS,
                    titleSelectors: JOB_TITLE_SELECTORS,
                });

                log(`Found ${pageCards.length} job cards on page ${pageNum}`);
                if (pageCards.length === 0) break;

                for (const card of pageCards) {
                    // ランクフィルターでスキップ判定
                    if (card.rank === 'A' && !includeA) { skippedA++; globalIndex++; continue; }
                    if (card.rank === 'B' && !includeB) { skippedB++; globalIndex++; continue; }
                    if (card.rank === 'C' && !includeC) { skippedC++; globalIndex++; continue; }

                    if (!card.url || card.url.includes('javascript:')) { globalIndex++; continue; }

                    // URL正規化
                    let fullUrl: string;
                    if (card.url.startsWith('http')) {
                        fullUrl = card.url;
                    } else if (card.url.startsWith('//')) {
                        fullUrl = `https:${card.url}`;
                    } else {
                        fullUrl = `https://tenshoku.mynavi.jp${card.url.startsWith('/') ? '' : '/'}${card.url}`;
                    }

                    if (!fullUrl.includes('mynavi.jp')) { globalIndex++; continue; }
                    if (fullUrl.includes('/msg/')) {
                        fullUrl = fullUrl.replace(/\/msg\/?$/, '/');
                    }

                    allJobs.push({
                        url: fullUrl,
                        companyName: card.companyName,
                        jobTitle: card.jobTitle,
                        rank: card.rank as BudgetRank,
                        displayIndex: globalIndex,
                    });
                    globalIndex++;
                }

                // 次のページへ
                const nextButton = page.locator('a:has-text("次へ"), .pager__next a, a[rel="next"]').first();
                if (await nextButton.count() > 0 && await nextButton.isVisible()) {
                    try {
                        await nextButton.click();
                        await page.waitForTimeout(randomDelay(1500, 2500));
                    } catch (error) {
                        hasNext = false;
                    }
                } else {
                    hasNext = false;
                }
            }

            // スキップ結果をログ出力
            const skippedTotal = skippedA + skippedB + skippedC;
            if (skippedTotal > 0) {
                const skippedDetails = [];
                if (skippedA > 0) skippedDetails.push(`A:${skippedA}`);
                if (skippedB > 0) skippedDetails.push(`B:${skippedB}`);
                if (skippedC > 0) skippedDetails.push(`C:${skippedC}`);
                log(`スキップ: ${skippedTotal}件 (${skippedDetails.join(', ')})`);
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
        const logFn = log || ((msg: string) => console.log(`[Mynavi] ${msg}`));

        // リトライロジック
        let retries = 1;
        while (retries >= 0) {
            try {
                logFn(`Visiting: ${jobInfo.companyName}`);

                await page.goto(jobInfo.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(randomDelay(300, 700));

                // 404/掲載終了チェック（複数パターン）
                const pageContent = await page.content();
                const is404 = pageContent.includes('404') ||
                    pageContent.includes('ページが見つかりません') ||
                    pageContent.includes('お探しのページは') ||
                    pageContent.includes('掲載が終了') ||
                    pageContent.includes('募集を終了') ||
                    pageContent.includes('掲載期間が終了');

                if (is404) {
                    logFn('Page not found or job expired, skipping');
                    return null;
                }

                // 会社名（必須）
                let companyName = jobInfo.companyName;
                if (!companyName) {
                    const pageCompanyEl = page.locator('.companyName, [class*="company-name"], h1').first();
                    if (await pageCompanyEl.count() > 0) {
                        companyName = (await pageCompanyEl.textContent())?.trim() || '';
                    }
                }

                // 会社名がない場合はスキップ
                if (!companyName) {
                    logFn('No company name found, skipping');
                    return null;
                }

                // 企業情報を1回のpage.evaluate()で一括抽出
                const fields = await page.evaluate(() => {
                    const result: Record<string, string | null> = {
                        companyUrl: null,
                        address: null,
                        industry: null,
                        employees: null,
                        establishment: null,
                        representative: null,
                        salary: null,
                    };

                    // th/td構造（jobOfferTable）から一括取得
                    const rows = document.querySelectorAll('tr');
                    for (const row of rows) {
                        const th = row.querySelector('th');
                        const td = row.querySelector('td');
                        if (!th || !td) continue;
                        const label = th.textContent?.trim() || '';
                        const getText = () => {
                            const textEl = td.querySelector('.text');
                            return (textEl?.textContent || td.textContent)?.trim() || '';
                        };

                        // 企業URL: リンクのテキスト内容を優先
                        if (label.includes('企業ホームページ') || label === '企業HP' || label === 'HP' || label === 'ホームページ' || label === 'URL' || label === '公式サイト' || label === 'WEBサイト') {
                            const link = td.querySelector('a') as HTMLAnchorElement | null;
                            if (link) {
                                const urlText = link.textContent?.trim();
                                if (urlText && urlText.startsWith('http') && !urlText.includes('mynavi.jp')) {
                                    result.companyUrl = urlText;
                                } else if (link.href && !link.href.includes('mynavi.jp') && link.href.startsWith('http')) {
                                    result.companyUrl = link.href;
                                }
                            } else {
                                const text = td.textContent?.trim();
                                if (text && text.startsWith('http') && !text.includes('mynavi.jp')) {
                                    result.companyUrl = text;
                                }
                            }
                        }

                        if (label.includes('本社所在地') || (!result.address && label.includes('勤務地'))) {
                            result.address = getText();
                        }
                        if (label.includes('事業内容') || (!result.industry && label.includes('業種'))) {
                            result.industry = getText();
                        }
                        if (label.includes('従業員数')) {
                            result.employees = getText();
                        }
                        if (label.includes('設立')) {
                            result.establishment = getText();
                        }
                        if (label.includes('代表者')) {
                            result.representative = getText();
                        }
                        if (label.includes('給与') || (!result.salary && label.includes('年収'))) {
                            result.salary = getText();
                        }
                    }

                    // dt/ddパターンもフォールバックとして確認
                    if (!result.companyUrl || !result.address) {
                        const dts = document.querySelectorAll('dt');
                        for (const dt of dts) {
                            const label = dt.textContent?.trim() || '';
                            const dd = dt.nextElementSibling;
                            if (!dd || dd.tagName !== 'DD') continue;
                            const value = dd.textContent?.trim() || '';

                            if (!result.address && (label.includes('本社所在地') || label.includes('勤務地'))) {
                                result.address = value;
                            }
                            if (!result.companyUrl && (label === '企業HP' || label === 'HP' || label === 'ホームページ')) {
                                const link = dd.querySelector('a') as HTMLAnchorElement | null;
                                if (link) {
                                    const urlText = link.textContent?.trim();
                                    if (urlText && urlText.startsWith('http') && !urlText.includes('mynavi.jp')) {
                                        result.companyUrl = urlText;
                                    }
                                }
                            }
                        }
                    }

                    // フォールバック: ページ全体から企業URLを探す
                    if (!result.companyUrl) {
                        const allLinks = document.querySelectorAll('a[href]');
                        for (const link of allLinks) {
                            const href = (link as HTMLAnchorElement).href;
                            const text = link.textContent?.trim() || '';
                            if (href && !href.includes('mynavi.jp') && !href.includes('google.com') && !href.includes('javascript:') && text.startsWith('http')) {
                                result.companyUrl = text;
                                break;
                            }
                        }
                    }

                    return result;
                });

                const normalizedAddress = normalizeAddressUtil(fields.address || undefined);
                const cleanName = cleanCompanyNameUtil(companyName);

                return {
                    source: this.source,
                    url: jobInfo.url,
                    company_name: cleanName,
                    job_title: jobInfo.jobTitle,
                    salary_text: normalizeSalary(fields.salary || undefined),
                    representative: fields.representative || undefined,
                    establishment: fields.establishment || undefined,
                    employees: normalizeEmployees(fields.employees || undefined),
                    phone: undefined,
                    address: normalizedAddress,
                    area: normalizeArea(extractPrefectureFromAddress(normalizedAddress)),
                    homepage_url: fields.companyUrl || undefined,
                    industry: normalizeIndustry(fields.industry || undefined),
                    scrape_status: 'step1_completed',
                    budget_rank: jobInfo.rank,
                    rank_confidence: jobInfo.rank === 'A' ? 0.9 : (jobInfo.rank === 'B' ? 0.7 : 0.6),
                    job_page_updated_at: null,
                    job_page_end_date: null,
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
