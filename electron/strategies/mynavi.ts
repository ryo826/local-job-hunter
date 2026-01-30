
import { Page } from 'playwright';
import { ScrapingStrategy, CompanyData, ScrapingParams } from './ScrapingStrategy';

// ランダム待機時間のヘルパー関数
function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 求人カードのセレクター候補（優先順位順）
const JOB_CARD_SELECTORS = [
    '.cassetteRecruitRecommend__content',  // 実際のHTML構造
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
    'a.linkArrowS',          // 「求人詳細を見る」リンク
    'a.js__ga--setCookieOccName',  // 求人タイトルリンク
    'a[href*="/jobinfo/"]',
    'a[href*="/msg/"]',
];

// 会社名セレクター候補
const COMPANY_NAME_SELECTORS = [
    'h3.cassetteRecruitRecommend__name',  // 実際のHTML構造
    '.cassetteRecruitRecommend__name',
    '.cassetteRecruit__name',
    '.companyName',
    '[class*="companyName"]',
];

// 求人タイトルセレクター候補
const JOB_TITLE_SELECTORS = [
    '.cassetteRecruitRecommend__copy a',  // 実際のHTML構造
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

    async *scrape(page: Page, params: ScrapingParams, onLog?: (message: string) => void): AsyncGenerator<CompanyData> {
        const { keywords, location } = params;

        const log = (msg: string) => {
            if (onLog) onLog(msg);
            else console.log(`[Mynavi] ${msg}`);
        };

        // 検索結果ページ
        let searchUrl = 'https://tenshoku.mynavi.jp/list/';

        // キーワード検索
        if (keywords) {
            searchUrl += `?searchKeyword=${encodeURIComponent(keywords)}`;
        }

        // エリア指定
        if (location) {
            const separator = searchUrl.includes('?') ? '&' : '?';
            searchUrl += `${separator}locationCodes=${encodeURIComponent(location)}`;
        }

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

        let hasNext = true;
        let pageNum = 0;
        const maxPages = 10;
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
            const jobUrls: { url: string; companyName: string; jobTitle: string }[] = [];

            for (const card of jobCards) {
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

                    jobUrls.push({ url: fullUrl, companyName, jobTitle });
                } catch (err) {
                    log(`Error extracting job URL from card: ${err}`);
                }
            }

            log(`Extracted ${jobUrls.length} valid job URLs`);

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
                        salary_text: salaryText,
                        representative,
                        establishment,
                        employees,
                        revenue,
                        phone: phone, // 求人ページのテーブルから取得できた場合のみ
                        address: normalizedAddress,
                        area: this.extractAreaFromAddress(normalizedAddress),
                        homepage_url: companyUrl,
                        industry,
                        job_description: jobDescription,
                        scrape_status: 'step1_completed',
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
                        // URL正規化: 二重ドメインや不正なパスを修正
                        let fullNextUrl: string;
                        if (nextUrl.startsWith('http')) {
                            fullNextUrl = nextUrl;
                        } else if (nextUrl.startsWith('//')) {
                            // プロトコル相対URL (//tenshoku.mynavi.jp/...)
                            fullNextUrl = `https:${nextUrl}`;
                        } else if (nextUrl.startsWith('/')) {
                            // 絶対パス
                            fullNextUrl = `https://tenshoku.mynavi.jp${nextUrl}`;
                        } else {
                            // 相対パス
                            fullNextUrl = `https://tenshoku.mynavi.jp/${nextUrl}`;
                        }
                        currentSearchUrl = fullNextUrl;
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
        // 優先順位1: 企業ホームページのテーブル行から取得
        // HTMLの実際の構造: <th>企業ホームページ</th><td><a>https://example.com/</a></td>
        // ※hrefはマイナビのリダイレクトURL、テキストが実際のURL
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
                }
            }
        }

        // 優先順位2: 一般的な企業ホームページリンク
        const homepageLink = page.locator('a:has-text("企業ホームページ"), a:has-text("コーポレートサイト")').first();
        if (await homepageLink.count() > 0) {
            // テキスト内容がURLの場合
            const text = (await homepageLink.textContent())?.trim();
            if (text && text.startsWith('http')) {
                return text;
            }
        }

        // 優先順位3: 会社概要セクションのリンク
        const companySection = page.locator('.jobOfferTable, .companyData, .company-info');
        const links = await companySection.locator('a[href^="http"]').all();
        for (const link of links) {
            const text = (await link.textContent())?.trim();
            if (text && text.startsWith('http') && !text.includes('mynavi.jp')) {
                return text;
            }
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
            .replace(/株式会社|有限会社|合同会社|一般社団法人|公益財団法人/g, '')
            .replace(/【.*?】/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/（.*?）/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private extractAreaFromAddress(address: string | undefined): string {
        if (!address) return '';
        const match = address.match(/([東京大阪京都神奈川埼玉千葉愛知北海道福岡].*?[都道府県市区町村])/);
        return match ? match[1] : '';
    }
}
