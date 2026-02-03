
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
// 優先度: data-ty="rzs" > 注目枠ラベル > ページ番号
async function classifyMynavi(card: Locator, pageNum: number): Promise<RankResult> {
    try {
        // 1. data-ty属性をチェック
        const dataTy = await card.getAttribute('data-ty');

        // 2. 注目枠ラベルの存在確認
        const hasAttentionLabel = await card.locator('.cassetteRecruitRecommend__label--attention').count() > 0;

        if (dataTy === 'rzs' || hasAttentionLabel) {
            return { rank: 'A', confidence: 0.9 };  // プレミアム枠
        } else if (pageNum === 1) {
            return { rank: 'B', confidence: 0.7 };  // 1ページ目の通常枠
        } else {
            return { rank: 'C', confidence: 0.6 };  // 2ページ目以降
        }
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
    // SearchPage統一カテゴリからのエイリアス
    '営業・販売': 'o11',
    '経営・事業企画・人事・事務': 'o14',
    'IT・Web・ゲームエンジニア': 'o16',
    'モノづくりエンジニア': 'o17',
    'コンサルタント・士業・金融': 'o19',
    'サービス・販売・接客': 'o12',
    '不動産・建設': 'o15',
    '物流・運輸・運転': 'o1B',
    '医療・福祉・介護': 'o13',
    'クリエイティブ・マスコミ': 'o1A',
    '教育・保育': 'o1F',
    'その他': 'o1C',
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
        const cardSelector = await this.waitForAnySelector(page, JOB_CARD_SELECTORS, 15000, log);
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
                    const normalizedAddress = this.normalizeAddress(address);

                    const cleanName = this.cleanCompanyName(companyName);

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
                        area: normalizeArea(this.extractAreaFromAddress(normalizedAddress)),
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

    // 複数のセレクターから最初に見つかったものを返す
    private async waitForAnySelector(page: Page, selectors: string[], timeout: number, log: (msg: string) => void): Promise<string | null> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            for (const selector of selectors) {
                try {
                    const count = await page.locator(selector).count();
                    if (count > 0) {
                        log(`Found ${count} elements with selector: ${selector}`);
                        return selector;
                    }
                } catch {
                    // セレクターがエラーになる場合はスキップ
                }
            }
            await page.waitForTimeout(500);
        }

        return null;
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
            // 方法1: 企業ホームページのテーブル行から取得
            // HTMLの実際の構造: <th>企業ホームページ</th><td><a>https://example.com/</a></td>
            const homepageRow = page.locator('th.jobOfferTable__head:has-text("企業ホームページ")').first();
            if (await homepageRow.count() > 0) {
                const tdEl = homepageRow.locator('~ td').first();
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
                }
            }

            // 方法2: 会社概要テーブルの「企業HP」「HP」行
            const hpLabels = ['企業HP', 'HP', 'ホームページ', 'URL', '公式サイト', 'WEBサイト'];
            for (const label of hpLabels) {
                const labelEl = page.locator(`th:has-text("${label}"), dt:has-text("${label}")`).first();
                if (await labelEl.count() > 0) {
                    const valueEl = labelEl.locator('~ td, ~ dd').first();
                    if (await valueEl.count() > 0) {
                        const linkEl = valueEl.locator('a').first();
                        if (await linkEl.count() > 0) {
                            const urlText = (await linkEl.textContent())?.trim();
                            if (urlText && urlText.startsWith('http') && !urlText.includes('mynavi.jp')) {
                                return urlText;
                            }
                        }
                        // リンクがない場合、テキストがURLかもしれない
                        const text = (await valueEl.textContent())?.trim();
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

    // テーブル形式のデータを抽出
    private async extractTableValue(page: Page, label: string): Promise<string | undefined> {
        // マイナビの実際の構造: th.jobOfferTable__head / td.jobOfferTable__body > div.text
        const jobOfferTh = page.locator(`th.jobOfferTable__head:has-text("${label}")`).first();
        if (await jobOfferTh.count() > 0) {
            const tdEl = jobOfferTh.locator('~ td.jobOfferTable__body').first();
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

        // 一般的な th/td パターン
        const thEl = page.locator(`th:has-text("${label}")`).first();
        if (await thEl.count() > 0) {
            const tdEl = thEl.locator('~ td').first();
            if (await tdEl.count() > 0) {
                return (await tdEl.textContent())?.trim() || undefined;
            }
        }

        // dt/dd パターン
        const dtEl = page.locator(`dt:has-text("${label}")`).first();
        if (await dtEl.count() > 0) {
            const ddEl = dtEl.locator('~ dd').first();
            if (await ddEl.count() > 0) {
                return (await ddEl.textContent())?.trim() || undefined;
            }
        }

        return undefined;
    }

    // 住所の正規化（都道府県から始まる形式に）
    private normalizeAddress(address: string | undefined): string | undefined {
        if (!address) return undefined;

        // 既に都道府県から始まっている場合はそのまま
        if (/^[東京大阪京都神奈川埼玉千葉愛知北海道福岡]/.test(address)) {
            return address;
        }

        // 都道府県を探して、そこから始まるように切り出す
        const match = address.match(/([東京大阪京都神奈川埼玉千葉愛知北海道福岡].*?[都道府県市区町村].+)/);
        if (match) {
            return match[1];
        }

        return address;
    }

    private cleanCompanyName(name: string): string {
        return name
            // パイプ以降を削除（求人タイトルが含まれている場合）
            .split(/[|｜]/)[0]
            // 【】内のプロモーション文のみ削除（株式会社等の法人格は保持）
            .replace(/【プライム市場】|【スタンダード市場】|【グロース市場】|【東証一部】|【東証二部】|【TOKYO PRO Market上場】|【急募】|【未経験歓迎】/g, '')
            // グループ会社の補足表記を削除
            .replace(/\(.*グループ.*\)/g, '')
            .replace(/（.*グループ.*）/g, '')
            // 全角英数字を半角に変換
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            // 全角スペースを半角に
            .replace(/　/g, ' ')
            // 余分な空白を整理
            .replace(/\s+/g, ' ')
            .trim();
    }

    private extractAreaFromAddress(address: string | undefined): string {
        if (!address) return '';
        const match = address.match(/([東京大阪京都神奈川埼玉千葉愛知北海道福岡].*?[都道府県市区町村])/);
        return match ? match[1] : '';
    }

    // 検索URLを構築するヘルパーメソッド
    // URL形式: https://tenshoku.mynavi.jp/{エリア}/list/p{都道府県コード}/o{職種コード}/
    private buildSearchUrl(params: ScrapingParams): string {
        const { keywords, prefectures, jobTypes } = params;

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
        } else {
            // 条件なしの場合はベースリストURL
            searchUrl += 'list/';
            if (jobCode) {
                searchUrl += `${jobCode}/`;
            }
        }

        // キーワード検索はクエリパラメータで追加
        if (keywords) {
            searchUrl += `?searchKeyword=${encodeURIComponent(keywords)}`;
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
            // セレクタ: .js__searchRecruit--count (カンマなし数字: 51740)
            const element = page.locator('.js__searchRecruit--count').first();
            if (await element.count() > 0) {
                const text = await element.textContent();
                if (text) {
                    const num = parseInt(text.replace(/,/g, ''), 10);
                    if (!isNaN(num)) {
                        return num;
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
                cardSelector = await this.waitForAnySelector(page, JOB_CARD_SELECTORS, 10000, log);
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
            if (onTotalCount) {
                const countElement = page.locator('.js__searchRecruit--count').first();
                if (await countElement.count() > 0) {
                    const text = await countElement.textContent();
                    if (text) {
                        const num = parseInt(text.replace(/,/g, ''), 10);
                        if (!isNaN(num)) {
                            log(`Total jobs: ${num}`);
                            onTotalCount(num);
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

                const jobCards = await page.locator(cardSelector).all();
                log(`Found ${jobCards.length} job cards on page ${pageNum}`);

                if (jobCards.length === 0) break;

                for (let i = 0; i < jobCards.length; i++) {
                    try {
                        const card = jobCards[i];

                        // ランク判定
                        const dataTy = await card.getAttribute('data-ty');
                        const hasAttentionLabel = await card.locator('.cassetteRecruitRecommend__label--attention').count() > 0;
                        const rank: BudgetRank = (dataTy === 'rzs' || hasAttentionLabel) ? 'A' : (pageNum === 1 ? 'B' : 'C');

                        // URLを取得
                        let url: string | null = null;
                        for (const linkSelector of JOB_LINK_SELECTORS) {
                            const linkEl = card.locator(linkSelector).first();
                            if (await linkEl.count() > 0) {
                                url = await linkEl.getAttribute('href');
                                if (url) break;
                            }
                        }

                        if (!url || url.includes('javascript:')) continue;

                        // URL正規化
                        let fullUrl: string;
                        if (url.startsWith('http')) {
                            fullUrl = url;
                        } else if (url.startsWith('//')) {
                            fullUrl = `https:${url}`;
                        } else {
                            fullUrl = `https://tenshoku.mynavi.jp${url.startsWith('/') ? '' : '/'}${url}`;
                        }

                        if (!fullUrl.includes('mynavi.jp')) continue;
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

                        allJobs.push({
                            url: fullUrl,
                            companyName,
                            jobTitle,
                            rank,
                            displayIndex: (pageNum - 1) * 50 + i,
                        });
                    } catch (err) {
                        // 個別エラーは無視
                    }
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
        let retries = 2;
        while (retries >= 0) {
            try {
                logFn(`Visiting: ${jobInfo.companyName}`);

                await page.goto(jobInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

                // 企業情報を抽出（エラーを無視して続行）
                let companyUrl: string | undefined;
                let address: string | undefined;
                let industry: string | undefined;
                let employees: string | undefined;
                let establishment: string | undefined;
                let representative: string | undefined;
                let salaryText: string | undefined;

                try {
                    companyUrl = await this.extractCompanyUrl(page);
                } catch { /* ignore */ }

                try {
                    address = await this.extractTableValue(page, '本社所在地') ||
                        await this.extractTableValue(page, '勤務地');
                } catch { /* ignore */ }

                try {
                    industry = await this.extractTableValue(page, '事業内容') ||
                        await this.extractTableValue(page, '業種');
                } catch { /* ignore */ }

                try {
                    employees = await this.extractTableValue(page, '従業員数');
                } catch { /* ignore */ }

                try {
                    establishment = await this.extractTableValue(page, '設立');
                } catch { /* ignore */ }

                try {
                    representative = await this.extractTableValue(page, '代表者');
                } catch { /* ignore */ }

                try {
                    salaryText = await this.extractTableValue(page, '給与') ||
                        await this.extractTableValue(page, '年収');
                } catch { /* ignore */ }

                const normalizedAddress = this.normalizeAddress(address);
                const cleanName = this.cleanCompanyName(companyName);

                return {
                    source: this.source,
                    url: jobInfo.url,
                    company_name: cleanName,
                    job_title: jobInfo.jobTitle,
                    salary_text: normalizeSalary(salaryText),
                    representative,
                    establishment,
                    employees: normalizeEmployees(employees),
                    phone: undefined,
                    address: normalizedAddress,
                    area: normalizeArea(this.extractAreaFromAddress(normalizedAddress)),
                    homepage_url: companyUrl,
                    industry: normalizeIndustry(industry),
                    scrape_status: 'step1_completed',
                    budget_rank: jobInfo.rank,
                    rank_confidence: jobInfo.rank === 'A' ? 0.9 : (jobInfo.rank === 'B' ? 0.7 : 0.6),
                    job_page_updated_at: null,
                    job_page_end_date: null,
                };
            } catch (error: any) {
                retries--;
                if (retries >= 0) {
                    logFn(`Retry (${2 - retries}/2) for ${jobInfo.companyName}: ${error.message}`);
                    await page.waitForTimeout(2000);
                } else {
                    logFn(`Failed ${jobInfo.companyName}: ${error.message}`);
                    return null;
                }
            }
        }
        return null;
    }
}
