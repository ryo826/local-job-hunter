"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DodaStrategy = void 0;
// ランダム待機時間のヘルパー関数
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
class DodaStrategy {
    source = 'doda';
    // レート制限設定
    REQUEST_INTERVAL = 4000; // 4秒
    PAGE_INTERVAL = 7000; // 7秒
    async *scrape(page, params, onLog) {
        const { keywords, location } = params;
        const log = (msg) => {
            if (onLog)
                onLog(msg);
            else
                console.log(`[Doda] ${msg}`);
        };
        // 検索結果ページ
        let searchUrl = 'https://doda.jp/DodaFront/View/JobSearchList.action';
        // キーワード検索
        if (keywords) {
            searchUrl += `?kw=${encodeURIComponent(keywords)}`;
        }
        log(`Navigating to: ${searchUrl}`);
        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            // 求人カードが表示されるまで待機
            await page.waitForSelector('.jobCard-card', { timeout: 15000 }).catch(() => {
                log('Warning: Job card selector not found, continuing anyway');
            });
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(randomDelay(3000, 5000));
        }
        catch (error) {
            log(`Error loading search page: ${error}`);
            return;
        }
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
                    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(randomDelay(2000, 4000));
                    // 404チェック
                    const is404 = await page.locator('text=/404|ページが見つかりません/i').count() > 0;
                    if (is404) {
                        log('404 page detected, skipping');
                        await page.goBack({ waitUntil: 'networkidle' });
                        continue;
                    }
                    // 会社概要タブをクリック (URLのtabパラメータを変更)
                    // タブリンク: a[href*="-tab__"]
                    const companyTabLink = page.locator('a[href*="-tab__co"], a:has-text("会社概要")').first();
                    if (await companyTabLink.count() > 0) {
                        try {
                            await companyTabLink.click();
                            await page.waitForLoadState('networkidle');
                            await page.waitForTimeout(randomDelay(1500, 3000));
                        }
                        catch (error) {
                            log(`Could not click company tab: ${error}`);
                        }
                    }
                    // 企業情報を抽出 (DescriptionList構造)
                    const companyUrl = await this.extractCompanyUrl(page);
                    const address = await this.extractDescriptionValue(page, '所在地') ||
                        await this.extractDescriptionValue(page, '本社所在地') ||
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
                        salary_text: salaryText,
                        representative,
                        establishment,
                        employees,
                        revenue,
                        phone: undefined, // 電話番号はGoogle Maps APIで取得
                        address: normalizedAddress,
                        area: this.extractAreaFromAddress(normalizedAddress) || locationFromList,
                        homepage_url: companyUrl,
                        industry,
                        scrape_status: 'step1_completed',
                    };
                    // リストページに戻る
                    await page.goBack({ waitUntil: 'networkidle' });
                    await page.waitForTimeout(randomDelay(2000, 4000));
                    // 会社概要タブから戻った場合、さらに戻る必要がある場合
                    const currentUrl = page.url();
                    if (!currentUrl.includes('JobSearchList')) {
                        await page.goBack({ waitUntil: 'networkidle' });
                        await page.waitForTimeout(randomDelay(1000, 2000));
                    }
                }
                catch (err) {
                    log(`Error scraping job: ${err}`);
                    try {
                        await page.goBack({ waitUntil: 'networkidle' });
                        await page.waitForTimeout(2000);
                    }
                    catch {
                        log('Failed to go back, reloading search page');
                        await page.goto(searchUrl, { waitUntil: 'networkidle' });
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
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(randomDelay(3000, 5000));
                }
                catch (error) {
                    log(`Error navigating to next page: ${error}`);
                    hasNext = false;
                }
            }
            else {
                log('No next page button found');
                hasNext = false;
            }
        }
        log(`Completed scraping ${pageNum} pages`);
    }
    // リストページの求人カードから情報を抽出
    async extractInfoFromCard(card, label) {
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
        }
        catch (error) {
            // ignore
        }
        return undefined;
    }
    // スクロールして追加コンテンツを読み込み
    async scrollToBottom(page, log) {
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
        }
        catch (error) {
            log(`Error during scroll: ${error}`);
        }
    }
    // 企業URLを抽出 (DescriptionList内の企業URLリンク)
    async extractCompanyUrl(page) {
        try {
            // 企業URLセクションのリンクを探す
            const companyLink = page.locator('a.jobSearchDetail-companyOverview__link').first();
            if (await companyLink.count() > 0) {
                const href = await companyLink.getAttribute('href');
                if (href && !href.includes('doda.jp')) {
                    return href;
                }
            }
            // フォールバック: DescriptionListから企業URLを探す
            const urlValue = await this.extractDescriptionValue(page, '企業URL');
            if (urlValue) {
                // URLを抽出 (テキストからURLを取り出す)
                const urlMatch = urlValue.match(/https?:\/\/[^\s<>"]+/);
                if (urlMatch) {
                    return urlMatch[0];
                }
            }
        }
        catch (error) {
            // ignore
        }
        return undefined;
    }
    // DescriptionList構造からデータを抽出
    async extractDescriptionValue(page, label) {
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
        }
        catch (error) {
            // ignore
        }
        return undefined;
    }
    // 住所の正規化
    normalizeAddress(address) {
        if (!address)
            return undefined;
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
    cleanCompanyName(name) {
        return name
            .replace(/株式会社|有限会社|合同会社|一般社団法人|公益財団法人/g, '')
            .replace(/【.*?】/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/（.*?）/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    extractAreaFromAddress(address) {
        if (!address)
            return '';
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
}
exports.DodaStrategy = DodaStrategy;
