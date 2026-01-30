"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RikunabiStrategy = void 0;
// ランダム待機時間のヘルパー関数
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
class RikunabiStrategy {
    source = 'rikunabi';
    // レート制限設定
    REQUEST_INTERVAL = 5000; // 5秒
    PAGE_INTERVAL = 8000; // 8秒
    async *scrape(page, params, onLog) {
        const { keywords, location } = params;
        const log = (msg) => {
            if (onLog)
                onLog(msg);
            else
                console.log(`[Rikunabi] ${msg}`);
        };
        // 検索結果ページ
        let searchUrl = 'https://next.rikunabi.com/lst/';
        // キーワード検索
        if (keywords) {
            searchUrl += `?kw=${encodeURIComponent(keywords)}`;
        }
        log(`Navigating to: ${searchUrl}`);
        // HTTP/2エラー対策: 複数回リトライ
        let retries = 3;
        let pageLoaded = false;
        while (retries > 0 && !pageLoaded) {
            try {
                // ステルス設定: webdriverフラグを削除
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                    // Chrome DevTools Protocol検出回避
                    window.chrome = { runtime: {} };
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
                }
                catch {
                    log('Network idle timeout, continuing...');
                }
                // 追加待機 - JSの実行完了を待つ
                log('Waiting for JavaScript to execute...');
                await page.waitForTimeout(5000);
                // Cookie同意ボタンがあればクリック
                const cookieSelectors = [
                    'button:has-text("同意")',
                    'button:has-text("OK")',
                    'button:has-text("Accept")',
                    '[class*="cookie"] button',
                    '[id*="cookie"] button'
                ];
                for (const selector of cookieSelectors) {
                    const cookieButton = page.locator(selector).first();
                    if (await cookieButton.count() > 0 && await cookieButton.isVisible()) {
                        log(`Found cookie consent button: ${selector}`);
                        await cookieButton.click().catch(() => { });
                        await page.waitForTimeout(1000);
                        break;
                    }
                }
                // モーダルを閉じる
                const modalSelectors = [
                    'button[aria-label="close"]',
                    'button[aria-label="閉じる"]',
                    '[class*="modal"] button[class*="close"]',
                    '[class*="overlay"] button'
                ];
                for (const selector of modalSelectors) {
                    const closeButton = page.locator(selector).first();
                    if (await closeButton.count() > 0 && await closeButton.isVisible()) {
                        log(`Found modal close button: ${selector}`);
                        await closeButton.click().catch(() => { });
                        await page.waitForTimeout(1000);
                        break;
                    }
                }
                // ページのURL確認
                const currentUrl = page.url();
                log(`Current URL: ${currentUrl}`);
                // デバッグ: ページタイトルとHTML構造を確認
                const pageTitle = await page.title();
                log(`Page title: ${pageTitle}`);
                // ページの状態を確認
                const bodyContent = await page.evaluate(() => {
                    const body = document.body;
                    return {
                        childCount: body.children.length,
                        textLength: body.innerText.length,
                        hasNextDiv: !!document.getElementById('__next'),
                        nextDivChildren: document.getElementById('__next')?.children.length || 0
                    };
                });
                log(`Page state: children=${bodyContent.childCount}, textLength=${bodyContent.textLength}, hasNext=${bodyContent.hasNextDiv}, nextChildren=${bodyContent.nextDivChildren}`);
                // 段階的スクロールでlazy loadをトリガー
                log('Triggering lazy load with scroll...');
                await page.evaluate(async () => {
                    for (let i = 0; i < 10; i++) {
                        window.scrollTo(0, i * 300);
                        await new Promise(r => setTimeout(r, 300));
                    }
                    window.scrollTo(0, 0);
                });
                await page.waitForTimeout(3000);
                // 様々なセレクターで求人カードを探す
                const cardSelectors = [
                    '[class*="cardHead"]',
                    '[class*="detailArea"]',
                    '[class*="employerName"]',
                    '[class*="jobCard"]',
                    '[class*="JobCard"]',
                    'article',
                    '[data-testid*="job"]',
                    'a[href*="/job/"]'
                ];
                let foundCards = false;
                for (const selector of cardSelectors) {
                    const count = await page.locator(selector).count();
                    if (count > 0) {
                        log(`Found ${count} elements with selector: ${selector}`);
                        foundCards = true;
                    }
                }
                if (!foundCards) {
                    // 追加のデバッグ情報
                    const allClasses = await page.evaluate(() => {
                        const elements = document.querySelectorAll('*[class]');
                        const classes = new Set();
                        elements.forEach(el => {
                            el.className.split(' ').forEach(c => {
                                if (c.includes('card') || c.includes('Card') || c.includes('job') || c.includes('Job') || c.includes('list') || c.includes('List')) {
                                    classes.add(c);
                                }
                            });
                        });
                        return Array.from(classes).slice(0, 20);
                    });
                    log(`Relevant CSS classes found: ${allClasses.join(', ')}`);
                }
                pageLoaded = true;
                log('Page loaded successfully');
            }
            catch (error) {
                retries--;
                log(`Error loading search page (${3 - retries}/3): ${error.message}`);
                if (retries > 0) {
                    log(`Retrying in 5 seconds...`);
                    await page.waitForTimeout(5000);
                }
                else {
                    log(`All retries failed. Stopping.`);
                    return;
                }
            }
        }
        let hasNext = true;
        let pageNum = 0;
        const maxPages = 5;
        while (hasNext && pageNum < maxPages) {
            pageNum++;
            log(`Scraping page ${pageNum}...`);
            // スクロールしてコンテンツ読み込み
            await this.scrollToBottom(page, log);
            // 求人カードを取得 - 複数の戦略を試行
            let jobCards = [];
            let cardType = '';
            // 戦略1: 求人リンクを直接探す（最も確実）
            const jobLinks = await page.locator('a[href*="/job/"]').all();
            log(`Found ${jobLinks.length} job links`);
            if (jobLinks.length > 0) {
                // リンクをユニークなURLでフィルタリング
                const seenUrls = new Set();
                for (const link of jobLinks) {
                    const href = await link.getAttribute('href');
                    if (href && !seenUrls.has(href)) {
                        seenUrls.add(href);
                        jobCards.push(link);
                    }
                }
                cardType = 'job links';
                log(`Unique job links: ${jobCards.length}`);
            }
            // 戦略2: カードコンテナを探す
            if (jobCards.length === 0) {
                const cardSelectors = [
                    '[class*="cardHead"]',
                    '[class*="detailArea"]',
                    '[class*="jobCard"]',
                    '[class*="JobCard"]',
                    'article[class*="card"]',
                    '[class*="listItem"]',
                    '[class*="ListItem"]'
                ];
                for (const selector of cardSelectors) {
                    const cards = await page.locator(selector).all();
                    if (cards.length > 0) {
                        jobCards = cards;
                        cardType = selector;
                        log(`Found ${cards.length} cards with selector: ${selector}`);
                        break;
                    }
                }
            }
            // 戦略3: 会社名要素から親をたどる
            if (jobCards.length === 0) {
                const employerNames = await page.locator('[class*="employerName"], [class*="companyName"]').all();
                log(`Found ${employerNames.length} employer name elements`);
                if (employerNames.length > 0) {
                    jobCards = employerNames;
                    cardType = 'employer names';
                }
            }
            log(`Total job cards found: ${jobCards.length} (type: ${cardType})`);
            // デバッグ: カードが見つからない場合、ページの状態を詳しく出力
            if (jobCards.length === 0) {
                const debugInfo = await page.evaluate(() => {
                    const allLinks = Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.includes('rikunabi'));
                    return {
                        linkCount: allLinks.length,
                        sampleLinks: allLinks.slice(0, 5),
                        bodyText: document.body.innerText.substring(0, 500)
                    };
                });
                log(`Debug - links: ${debugInfo.linkCount}, samples: ${debugInfo.sampleLinks.join(', ')}`);
                log(`Debug - body text preview: ${debugInfo.bodyText.substring(0, 200)}...`);
            }
            if (jobCards.length === 0) {
                log('No job cards found, stopping');
                break;
            }
            for (const card of jobCards) {
                try {
                    // リンクベースの場合、直接URLを取得
                    let detailUrl = '';
                    if (cardType === 'job links') {
                        detailUrl = await card.getAttribute('href') || '';
                    }
                    // カードコンテナを特定
                    let cardContainer = card;
                    if (cardType === 'job links' || cardType === 'employer names') {
                        // 親要素をたどってカードコンテナを探す
                        cardContainer = card.locator('xpath=ancestor::*[contains(@class, "card") or contains(@class, "Card") or contains(@class, "item") or contains(@class, "Item")][1]');
                        if (await cardContainer.count() === 0) {
                            cardContainer = card.locator('..').locator('..');
                        }
                    }
                    // リンクURLを取得（まだ取得していない場合）
                    if (!detailUrl) {
                        const linkEl = cardContainer.locator('a[href*="/job/"]').first();
                        if (await linkEl.count() > 0) {
                            detailUrl = await linkEl.getAttribute('href') || '';
                        }
                    }
                    if (!detailUrl) {
                        log('No detail URL found, skipping');
                        continue;
                    }
                    // 完全なURLに変換
                    const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://next.rikunabi.com${detailUrl}`;
                    log(`Visiting detail page: ${fullUrl}`);
                    // レート制限
                    await page.waitForTimeout(this.REQUEST_INTERVAL);
                    // 詳細ページへ移動
                    try {
                        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(randomDelay(3000, 5000));
                    }
                    catch (navError) {
                        log(`Navigation error: ${navError.message}, skipping`);
                        continue;
                    }
                    // 詳細ページから会社名を取得
                    let companyName = '';
                    const companySelectors = [
                        'a[class*="linkTextCompany"]',
                        'a[href*="/company/"]',
                        '[class*="employerName"]',
                        '[class*="companyName"]'
                    ];
                    for (const selector of companySelectors) {
                        const el = page.locator(selector).first();
                        if (await el.count() > 0) {
                            companyName = (await el.textContent())?.trim() || '';
                            if (companyName)
                                break;
                        }
                    }
                    if (!companyName) {
                        log('No company name found on detail page, skipping');
                        continue;
                    }
                    // 職種を取得
                    let jobTitle = '';
                    const titleSelectors = ['h1', 'h2[class*="title"]', '[class*="heading"] h2'];
                    for (const selector of titleSelectors) {
                        const el = page.locator(selector).first();
                        if (await el.count() > 0) {
                            jobTitle = (await el.textContent())?.trim() || '';
                            if (jobTitle)
                                break;
                        }
                    }
                    log(`Found: ${companyName}`);
                    // 詳細ページから情報を抽出
                    // 会社名（詳細ページから正式名称を取得）
                    const companyNameLinkEl = page.locator('a[class*="linkTextCompany"], a[href*="/company/"]').first();
                    if (await companyNameLinkEl.count() > 0) {
                        const detailCompanyName = (await companyNameLinkEl.textContent())?.trim();
                        if (detailCompanyName) {
                            companyName = detailCompanyName;
                        }
                    }
                    // 「企業情報」タブをクリック
                    const companyTabButton = page.locator('span:has-text("企業情報"), button:has-text("企業情報"), a:has-text("企業情報")').first();
                    if (await companyTabButton.count() > 0) {
                        try {
                            await companyTabButton.click();
                            await page.waitForTimeout(randomDelay(2000, 3000));
                        }
                        catch (error) {
                            log(`Could not click company tab: ${error}`);
                        }
                    }
                    // 企業情報を抽出
                    const address = await this.extractTextByLabel(page, '本社所在地') ||
                        await this.extractTextByLabel(page, '所在地') ||
                        await this.extractTextByLabel(page, '勤務地');
                    const industry = await this.extractTextByLabel(page, '事業内容') ||
                        await this.extractTextByLabel(page, '業種');
                    const employees = await this.extractTextByLabel(page, '従業員数');
                    const establishment = await this.extractTextByLabel(page, '設立');
                    const representative = await this.extractTextByLabel(page, '代表者');
                    const revenue = await this.extractTextByLabel(page, '売上高');
                    const phone = await this.extractTextByLabel(page, '企業代表番号') ||
                        await this.extractTextByLabel(page, '電話番号');
                    const detailSalary = await this.extractTextByLabel(page, '給与') ||
                        await this.extractTextByLabel(page, '月給');
                    // 企業HPを取得
                    const companyUrl = await this.extractCompanyUrl(page);
                    // 住所の正規化
                    const normalizedAddress = this.normalizeAddress(address);
                    const cleanName = this.cleanCompanyName(companyName);
                    yield {
                        source: this.source,
                        url: page.url(),
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: detailSalary,
                        representative,
                        establishment,
                        employees,
                        revenue,
                        phone: phone,
                        address: normalizedAddress,
                        area: this.extractAreaFromAddress(normalizedAddress),
                        homepage_url: companyUrl,
                        industry,
                        scrape_status: 'step1_completed',
                    };
                    // リストページに戻る
                    await page.goBack({ waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(randomDelay(2000, 4000));
                    // URLが検索結果ページでない場合、再度戻る
                    if (!page.url().includes('/lst/')) {
                        await page.goBack({ waitUntil: 'domcontentloaded' });
                        await page.waitForTimeout(randomDelay(1000, 2000));
                    }
                }
                catch (err) {
                    log(`Error scraping job: ${err}`);
                    try {
                        await page.goBack({ waitUntil: 'domcontentloaded' });
                        await page.waitForTimeout(2000);
                    }
                    catch {
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
            // ページネーション
            const nextButton = page.locator('a:has-text("次へ"), a:has-text("次のページ"), a[rel="next"], [class*="next"] a').first();
            if (await nextButton.count() > 0 && await nextButton.isVisible()) {
                try {
                    await nextButton.click();
                    await page.waitForTimeout(randomDelay(4000, 6000));
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
    // スクロールしてコンテンツを読み込み
    async scrollToBottom(page, log) {
        try {
            let previousHeight = 0;
            let currentHeight = await page.evaluate(() => document.body.scrollHeight);
            let attempts = 0;
            const maxAttempts = 3;
            while (previousHeight < currentHeight && attempts < maxAttempts) {
                previousHeight = currentHeight;
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForTimeout(randomDelay(1000, 2000));
                currentHeight = await page.evaluate(() => document.body.scrollHeight);
                attempts++;
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(500);
        }
        catch (error) {
            log(`Error during scroll: ${error}`);
        }
    }
    // ラベルからテキストを抽出
    async extractTextByLabel(page, label) {
        try {
            // 方法1: ラベルの次の要素を探す
            const labelEl = page.locator(`text="${label}"`).first();
            if (await labelEl.count() > 0) {
                // 同じ親の中の次の要素を探す
                const parent = labelEl.locator('..');
                const nextP = parent.locator('p[class*="bodyText"]').first();
                if (await nextP.count() > 0) {
                    const text = await nextP.textContent();
                    if (text && !text.includes(label)) {
                        return this.cleanText(text);
                    }
                }
            }
            // 方法2: dt/dd パターン
            const dtEl = page.locator(`dt:has-text("${label}")`).first();
            if (await dtEl.count() > 0) {
                const ddEl = dtEl.locator('~ dd').first();
                if (await ddEl.count() > 0) {
                    return this.cleanText(await ddEl.textContent());
                }
            }
            // 方法3: th/td パターン
            const thEl = page.locator(`th:has-text("${label}")`).first();
            if (await thEl.count() > 0) {
                const tdEl = thEl.locator('~ td').first();
                if (await tdEl.count() > 0) {
                    return this.cleanText(await tdEl.textContent());
                }
            }
            // 方法4: テキスト内のラベル: 値 パターン
            const allText = await page.locator(`text=/${label}[：:]/`).first();
            if (await allText.count() > 0) {
                const text = await allText.textContent();
                if (text) {
                    const match = text.match(new RegExp(`${label}[：:]\\s*(.+)`));
                    if (match) {
                        return this.cleanText(match[1]);
                    }
                }
            }
        }
        catch (error) {
            // ignore
        }
        return undefined;
    }
    // テキストをクリーンアップ
    cleanText(text) {
        if (!text)
            return undefined;
        return text
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '')
            .trim() || undefined;
    }
    // 企業URLを抽出
    async extractCompanyUrl(page) {
        try {
            const homepageLink = page.locator('a:has-text("企業ホームページ"), a:has-text("HP"), a:has-text("公式サイト")').first();
            if (await homepageLink.count() > 0) {
                const href = await homepageLink.getAttribute('href');
                if (href && !href.includes('rikunabi.com')) {
                    return href;
                }
            }
            // 外部リンクを探す
            const externalLinks = await page.locator('a[href^="http"]:not([href*="rikunabi.com"])').all();
            for (const link of externalLinks) {
                const href = await link.getAttribute('href');
                if (href && !href.includes('javascript:') && !href.includes('mailto:')) {
                    return href;
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
    cleanCompanyName(name) {
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
exports.RikunabiStrategy = RikunabiStrategy;
