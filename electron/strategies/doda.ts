import { Page } from 'playwright';
import { ScrapingStrategy, CompanyData, ScrapingParams } from './ScrapingStrategy';
import { normalizeIndustry, normalizeArea, normalizeSalary, normalizeEmployees } from '../utils/data-normalizer';

// ランダム待機時間のヘルパー関数
function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// doda都道府県コードマッピング（JISコード準拠）
// URL形式: /DodaFront/View/JobSearchList/j_pr__{コード}/
const prefectureCodes: Record<string, string> = {
    '北海道': '01',
    '青森県': '02',
    '岩手県': '03',
    '宮城県': '04',
    '秋田県': '05',
    '山形県': '06',
    '福島県': '07',
    '茨城県': '08',
    '栃木県': '09',
    '群馬県': '10',
    '埼玉県': '11',
    '千葉県': '12',
    '東京都': '13',
    '神奈川県': '14',
    '新潟県': '15',
    '富山県': '16',
    '石川県': '17',
    '福井県': '18',
    '山梨県': '19',
    '長野県': '20',
    '岐阜県': '21',
    '静岡県': '22',
    '愛知県': '23',
    '三重県': '24',
    '滋賀県': '25',
    '京都府': '26',
    '大阪府': '27',
    '兵庫県': '28',
    '奈良県': '29',
    '和歌山県': '30',
    '鳥取県': '31',
    '島根県': '32',
    '岡山県': '33',
    '広島県': '34',
    '山口県': '35',
    '徳島県': '36',
    '香川県': '37',
    '愛媛県': '38',
    '高知県': '39',
    '福岡県': '40',
    '佐賀県': '41',
    '長崎県': '42',
    '熊本県': '43',
    '大分県': '44',
    '宮崎県': '45',
    '鹿児島県': '46',
    '沖縄県': '47',
};

// doda職種カテゴリマッピング（Lサフィックス付き）
// URL形式: /-oc__{コード}L/
const jobTypeCodes: Record<string, string> = {
    // サイト固有の名称
    '営業': '01L',
    '企画・管理': '02L',
    'SE/インフラエンジニア/Webエンジニア': '03L',
    '機械/電気': '04L',
    '化学/素材/化粧品 ほか': '05L',
    '建築/土木/不動産/プラント/設備': '06L',
    'コンサルタント/士業': '07L',
    'クリエイティブ': '08L',
    '販売/サービス': '09L',
    '公務員/教員 ほか': '10L',
    '事務/アシスタント': '11L',
    '医療系専門職': '12L',
    '金融専門職': '13L',
    '組み込みソフトウェア': '14L',
    '食品/香料/飼料 ほか': '15L',
    // SearchPage統一カテゴリからのエイリアス
    '営業・販売': '01L',
    '経営・事業企画・人事・事務': '02L',
    'IT・Web・ゲームエンジニア': '03L',
    'モノづくりエンジニア': '04L',
    'コンサルタント・士業・金融': '07L',
    'サービス・販売・接客': '09L',
    '不動産・建設': '06L',
    '物流・運輸・運転': '09L',
    '医療・福祉・介護': '12L',
    'クリエイティブ・マスコミ': '08L',
    '教育・保育': '10L',
    'その他': '10L',
};

export class DodaStrategy implements ScrapingStrategy {
    readonly source = 'doda';

    // レート制限設定
    private readonly REQUEST_INTERVAL = 4000;  // 4秒
    private readonly PAGE_INTERVAL = 7000;     // 7秒

    async *scrape(page: Page, params: ScrapingParams, onLog?: (message: string) => void): AsyncGenerator<CompanyData> {
        const log = (msg: string) => {
            if (onLog) onLog(msg);
            else console.log(`[Doda] ${msg}`);
        };

        // 検索結果ページのURLを構築
        const searchUrl = this.buildSearchUrl(params);
        let currentSearchUrl = searchUrl;

        log(`Navigating to: ${searchUrl}`);

        // HTTP/2エラー対策: 複数回リトライ
        let retries = 3;
        let pageLoaded = false;

        while (retries > 0 && !pageLoaded) {
            try {
                // ページ遷移前に追加ヘッダーを設定
                await page.setExtraHTTPHeaders({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                });

                // domcontentloadedで試行（networkidleより軽量）
                await page.goto(searchUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                // 追加の待機
                await page.waitForTimeout(randomDelay(2000, 4000));

                // 求人カードが表示されるまで待機
                await page.waitForSelector('.jobCard-card', { timeout: 15000 }).catch(() => {
                    log('Warning: Job card selector not found, continuing anyway');
                });

                pageLoaded = true;
                log('Page loaded successfully');

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

        await page.waitForTimeout(randomDelay(2000, 3000));

        let hasNext = true;
        let pageNum = 0;
        const maxPages = 10;

        while (hasNext && pageNum < maxPages) {
            pageNum++;
            log(`Scraping page ${pageNum}...`);

            // スクロールして追加コンテンツを読み込み
            await this.scrollToBottom(page, log);

            // 求人カードを取得
            const jobCards = await page.locator('.jobCard-card').all();
            log(`Found ${jobCards.length} job cards`);

            if (jobCards.length === 0) {
                log('No job cards found, stopping');
                break;
            }

            for (const card of jobCards) {
                try {
                    // 求人詳細ページへのリンクを取得
                    const linkEl = card.locator('a.jobCard-header__link').first();
                    const url = await linkEl.getAttribute('href');

                    if (!url) {
                        log('No detail link found, skipping');
                        continue;
                    }

                    const fullUrl = url.startsWith('http') ? url : `https://doda.jp${url}`;

                    // リストページから基本情報を抽出
                    // 会社名: h2要素
                    const companyNameEl = card.locator('a.jobCard-header__link h2').first();
                    let companyName = (await companyNameEl.textContent())?.trim() || '';

                    // 職種: h2の次のp要素
                    const jobTitleEl = card.locator('a.jobCard-header__link p').first();
                    const jobTitle = (await jobTitleEl.textContent())?.trim() || '';

                    // リストページから給与・勤務地を抽出
                    const salaryFromList = await this.extractInfoFromCard(card, '給与');
                    const locationFromList = await this.extractInfoFromCard(card, '勤務地');
                    const industryFromList = await this.extractInfoFromCard(card, '事業');

                    log(`Found: ${companyName}`);
                    log(`Visiting detail page: ${fullUrl}`);

                    // 詳細ページに移動
                    await page.waitForTimeout(this.REQUEST_INTERVAL);

                    try {
                        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(randomDelay(3000, 5000));
                    } catch (navError: any) {
                        log(`Navigation error: ${navError.message}, skipping`);
                        continue;
                    }

                    // 404チェック
                    const is404 = await page.locator('text=/404|ページが見つかりません/i').count() > 0;
                    if (is404) {
                        log('404 page detected, skipping');
                        await page.goBack({ waitUntil: 'domcontentloaded' });
                        continue;
                    }

                    // 正しいURL形式: /-tab__jd/-fm__jobdetail/
                    // 会社概要は同じページ内でスクロールした先にある
                    let jobDetailUrl = fullUrl;

                    // URLに-tab__jd/-fm__jobdetail/がない場合は修正
                    if (!fullUrl.includes('-fm__jobdetail')) {
                        if (fullUrl.includes('-tab__')) {
                            jobDetailUrl = fullUrl.replace(/-tab__[a-z]+\/?$/, '-tab__jd/-fm__jobdetail/');
                        } else {
                            jobDetailUrl = fullUrl.replace(/\/?$/, '/-tab__jd/-fm__jobdetail/');
                        }
                        jobDetailUrl = jobDetailUrl.replace(/\/+/g, '/').replace(':/', '://');

                        log(`Navigating to job detail page: ${jobDetailUrl}`);
                        try {
                            await page.goto(jobDetailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForTimeout(randomDelay(2000, 4000));
                            log('Job detail page loaded');
                        } catch (error: any) {
                            log(`Failed to navigate to job detail: ${error.message}`);
                        }
                    }

                    // ページ全体をスクロールして会社概要セクションを読み込む
                    log('Scrolling to load company overview section...');
                    await page.evaluate(async () => {
                        // 徐々にスクロールして遅延読み込みをトリガー
                        const scrollStep = 500;
                        let currentPosition = 0;
                        const maxScroll = document.body.scrollHeight;

                        while (currentPosition < maxScroll) {
                            currentPosition += scrollStep;
                            window.scrollTo(0, currentPosition);
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }

                        // 最下部まで確実にスクロール
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await page.waitForTimeout(2000);

                    // 会社概要セクションが表示されるまで待つ
                    try {
                        await page.waitForSelector('a.jobSearchDetail-companyOverview__link, dt', { timeout: 5000 });
                        log('Company overview elements found');
                    } catch {
                        log('Company overview elements not found within timeout');
                    }

                    // 企業情報を抽出 (DescriptionList構造)
                    log('Extracting company URL...');
                    const companyUrl = await this.extractCompanyUrl(page, log);
                    log(`Company URL result: ${companyUrl || 'not found'}`);
                    const address = await this.extractDescriptionValue(page, '本社所在地') ||
                        await this.extractDescriptionValue(page, '所在地') ||
                        await this.extractDescriptionValue(page, '勤務地');
                    const industry = await this.extractDescriptionValue(page, '事業概要') ||
                        await this.extractDescriptionValue(page, '事業内容') ||
                        industryFromList;
                    const employees = await this.extractDescriptionValue(page, '従業員数');
                    const establishment = await this.extractDescriptionValue(page, '設立');
                    const representative = await this.extractDescriptionValue(page, '代表者');
                    const revenue = await this.extractDescriptionValue(page, '売上高');
                    const capital = await this.extractDescriptionValue(page, '資本金');
                    const salaryText = salaryFromList ||
                        await this.extractDescriptionValue(page, '給与') ||
                        await this.extractDescriptionValue(page, '年収');

                    // 住所の正規化
                    const normalizedAddress = this.normalizeAddress(address);
                    const cleanName = this.cleanCompanyName(companyName);

                    // Note: 電話番号はGoogle Maps APIで後から取得するため、Step 2はスキップ

                    yield {
                        source: this.source,
                        url: fullUrl,
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: normalizeSalary(salaryText),
                        representative,
                        establishment,
                        employees: normalizeEmployees(employees),
                        revenue,
                        phone: undefined, // 電話番号はGoogle Maps APIで取得
                        address: normalizedAddress,
                        area: normalizeArea(this.extractAreaFromAddress(normalizedAddress) || locationFromList),
                        homepage_url: companyUrl,
                        industry: normalizeIndustry(industry),
                        scrape_status: 'step1_completed',
                    };

                    // リストページに戻る
                    await page.goBack({ waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(randomDelay(2000, 4000));

                    // 会社概要タブから戻った場合、さらに戻る必要がある場合
                    const currentUrl = page.url();
                    if (!currentUrl.includes('JobSearchList')) {
                        await page.goBack({ waitUntil: 'domcontentloaded' });
                        await page.waitForTimeout(randomDelay(1000, 2000));
                    }

                } catch (err) {
                    log(`Error scraping job: ${err}`);
                    try {
                        await page.goBack({ waitUntil: 'domcontentloaded' });
                        await page.waitForTimeout(2000);
                    } catch {
                        log('Failed to go back, reloading search page');
                        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
                        await page.waitForTimeout(3000);
                        break;
                    }
                    continue;
                }
            }

            // 次のページへ
            await page.waitForTimeout(this.PAGE_INTERVAL);

            // ページネーション: 次へボタンを探す
            const nextButton = page.locator('a:has-text("次のページ"), a:has-text("次へ"), a[rel="next"], .pager a:has-text("次")').first();
            if (await nextButton.count() > 0 && await nextButton.isVisible()) {
                try {
                    await nextButton.click();
                    await page.waitForTimeout(randomDelay(4000, 6000));
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

    // リストページの求人カードから情報を抽出
    private async extractInfoFromCard(card: any, label: string): Promise<string | undefined> {
        try {
            // jobCard-info構造: dt.jobCard-info__title に label があり、dd.jobCard-info__content に値がある
            const infoItems = await card.locator('dl.jobCard-info').all();
            for (const item of infoItems) {
                const titleEl = item.locator('dt.jobCard-info__title');
                const titleText = await titleEl.textContent();
                if (titleText && titleText.includes(label)) {
                    const contentEl = item.locator('dd.jobCard-info__content');
                    const content = await contentEl.textContent();
                    return content?.trim() || undefined;
                }
            }
        } catch (error) {
            // ignore
        }
        return undefined;
    }

    // スクロールして追加コンテンツを読み込み
    private async scrollToBottom(page: Page, log: (msg: string) => void): Promise<void> {
        try {
            let previousHeight = 0;
            let currentHeight = await page.evaluate(() => document.body.scrollHeight);
            let attempts = 0;
            const maxAttempts = 5;

            while (previousHeight < currentHeight && attempts < maxAttempts) {
                previousHeight = currentHeight;

                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });

                await page.waitForTimeout(randomDelay(1000, 2000));

                currentHeight = await page.evaluate(() => document.body.scrollHeight);
                attempts++;
            }

            // トップに戻る
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(500);

        } catch (error) {
            log(`Error during scroll: ${error}`);
        }
    }

    // 企業URLを抽出 (DescriptionList内の企業URLリンク)
    private async extractCompanyUrl(page: Page, log: (msg: string) => void): Promise<string | undefined> {
        try {
            // ページ内のJavaScriptで直接探す（動的コンテンツ対応）
            const result = await page.evaluate(() => {
                const debug: string[] = [];

                // 方法1: jobSearchDetail-companyOverview__link クラスのリンクを探す
                const directLink = document.querySelector('a.jobSearchDetail-companyOverview__link') as HTMLAnchorElement;
                if (directLink && directLink.href && !directLink.href.includes('doda.jp')) {
                    debug.push(`Found via direct class: ${directLink.href}`);
                    return { url: directLink.href, debug };
                }

                // 方法2: dt要素から「企業URL」を探す
                const dts = document.querySelectorAll('dt');
                debug.push(`Found ${dts.length} dt elements`);

                const dtTexts: string[] = [];
                for (const dt of dts) {
                    const text = dt.textContent?.trim();
                    if (text) dtTexts.push(text);

                    if (text === '企業URL') {
                        // 親のcolumnItemを探す
                        const parent = dt.closest('[class*="columnItem"]');
                        if (parent) {
                            const link = parent.querySelector('a') as HTMLAnchorElement;
                            if (link && link.href && !link.href.includes('doda.jp')) {
                                debug.push(`Found via parent columnItem: ${link.href}`);
                                return { url: link.href, debug };
                            }
                        }

                        // 隣接するdd要素を探す
                        const dd = dt.nextElementSibling;
                        if (dd && dd.tagName === 'DD') {
                            const link = dd.querySelector('a') as HTMLAnchorElement;
                            if (link && link.href && !link.href.includes('doda.jp')) {
                                debug.push(`Found via adjacent dd: ${link.href}`);
                                return { url: link.href, debug };
                            }
                        }
                    }
                }
                debug.push(`dt labels: ${dtTexts.slice(0, 10).join(', ')}`);

                // 方法3: DescriptionList構造から探す
                const columnItems = document.querySelectorAll('[class*="descriptionList__columnItem"]');
                debug.push(`Found ${columnItems.length} columnItems`);

                for (const item of columnItems) {
                    const dt = item.querySelector('dt');
                    if (dt && dt.textContent?.trim() === '企業URL') {
                        const link = item.querySelector('a') as HTMLAnchorElement;
                        if (link && link.href && !link.href.includes('doda.jp')) {
                            debug.push(`Found via columnItem structure: ${link.href}`);
                            return { url: link.href, debug };
                        }
                    }
                }

                debug.push('No company URL found');
                return { url: null, debug };
            });

            // デバッグログ出力
            for (const msg of result.debug) {
                log(`[JS] ${msg}`);
            }

            if (result.url) {
                log(`Found company URL: ${result.url}`);
                return result.url;
            }

            log('No company URL found');
        } catch (error: any) {
            log(`Error extracting company URL: ${error.message}`);
        }
        return undefined;
    }

    // DescriptionList構造からデータを抽出
    private async extractDescriptionValue(page: Page, label: string): Promise<string | undefined> {
        try {
            // DescriptionList-module構造
            const dtElements = await page.locator('dt').all();
            for (const dt of dtElements) {
                const dtText = await dt.textContent();
                if (dtText && dtText.trim() === label) {
                    // 次の兄弟要素のddを取得
                    const parent = dt.locator('..');
                    const dd = parent.locator('dd').first();
                    if (await dd.count() > 0) {
                        const text = await dd.textContent();
                        return text?.trim().replace(/\s+/g, ' ') || undefined;
                    }
                }
            }

            // フォールバック: dt/dd パターン (隣接兄弟)
            const dtEl = page.locator(`dt:has-text("${label}")`).first();
            if (await dtEl.count() > 0) {
                const ddEl = dtEl.locator('~ dd').first();
                if (await ddEl.count() > 0) {
                    const text = await ddEl.textContent();
                    return text?.trim().replace(/\s+/g, ' ') || undefined;
                }
            }
        } catch (error) {
            // ignore
        }
        return undefined;
    }

    // 住所の正規化
    private normalizeAddress(address: string | undefined): string | undefined {
        if (!address) return undefined;

        // 郵便番号を除去
        let normalized = address.replace(/〒?\d{3}-?\d{4}\s*/g, '').trim();

        // 改行や余分な空白を整理
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // 都道府県から始まるように
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
            // パイプ以降を削除（求人タイトルが含まれている場合）
            .split(/[|｜]/)[0]
            // 【】内のプロモーション文を削除（ただし会社名の一部は残す）
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
    // URL形式: https://doda.jp/DodaFront/View/JobSearchList/j_pr__{都道府県コード}/-oc__{職種コード}/
    private buildSearchUrl(params: ScrapingParams): string {
        const { keywords, prefectures, jobTypes } = params;

        // パスベースのURL構築
        let pathParts: string[] = [];

        // 都道府県（最初の1つを使用）
        if (prefectures && prefectures.length > 0) {
            const prefCode = prefectureCodes[prefectures[0]];
            if (prefCode) {
                pathParts.push(`j_pr__${prefCode}`);
            }
        }

        // 職種（最初の1つを使用）- 組み合わせ時はハイフン付き
        if (jobTypes && jobTypes.length > 0) {
            const jobCode = jobTypeCodes[jobTypes[0]];
            if (jobCode) {
                // 都道府県と組み合わせる場合は -oc__ を使用
                if (pathParts.length > 0) {
                    pathParts.push(`-oc__${jobCode}`);
                } else {
                    pathParts.push(`j_oc__${jobCode}`);
                }
            }
        }

        // URL構築
        let searchUrl = 'https://doda.jp/DodaFront/View/JobSearchList/';
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
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);

            // dodaの検索結果件数を取得
            // セレクタ: .search-sidebar__total-count__number (カンマ区切り数字: 268,576)
            const element = page.locator('.search-sidebar__total-count__number').first();
            if (await element.count() > 0) {
                const text = await element.textContent();
                if (text) {
                    // カンマを除去して数値に変換
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
}
