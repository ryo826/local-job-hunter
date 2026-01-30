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
    REQUEST_INTERVAL = 3000; // 3秒
    PAGE_INTERVAL = 5000; // 5秒
    async *scrape(page, params, onLog) {
        const { keywords, location } = params;
        const log = (msg) => {
            if (onLog)
                onLog(msg);
            else
                console.log(`[Rikunabi] ${msg}`);
        };
        // 検索結果ページURL構築 (正しいURL: /job_search/)
        let searchUrl = 'https://next.rikunabi.com/job_search/';
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
                await page.waitForTimeout(3000);
                // 求人カードが表示されるまで待機
                log('Waiting for job cards to load...');
                try {
                    await page.waitForSelector('a[class*="styles_bigCard"]', { timeout: 15000 });
                    log('Job cards found!');
                }
                catch {
                    log('Warning: Job card selector not found, trying alternative...');
                    // 代替セレクターを試す
                    try {
                        await page.waitForSelector('[class*="styles_detailArea"]', { timeout: 10000 });
                        log('Found detailArea elements');
                    }
                    catch {
                        log('Warning: No job cards found after extended wait');
                    }
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
            // 各カードからURLを収集
            const jobUrls = [];
            for (const card of jobCards) {
                const href = await card.getAttribute('href');
                if (href && href.includes('/viewjob/')) {
                    jobUrls.push(href);
                }
            }
            log(`Collected ${jobUrls.length} job URLs`);
            // 各求人詳細ページを訪問
            for (const jobUrl of jobUrls) {
                try {
                    const fullUrl = jobUrl.startsWith('http') ? jobUrl : `https://next.rikunabi.com${jobUrl}`;
                    log(`Visiting: ${fullUrl}`);
                    // レート制限
                    await page.waitForTimeout(this.REQUEST_INTERVAL);
                    // 詳細ページへ移動
                    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 15000 });
                    }
                    catch {
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
                    // データを統合
                    const address = companyInfo['本社所在地'] || jobDetails['勤務地'] || '';
                    const normalizedAddress = this.normalizeAddress(address);
                    const cleanName = this.cleanCompanyName(companyName);
                    yield {
                        source: this.source,
                        url: page.url(),
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: jobDetails['給与'] || '',
                        representative: companyInfo['代表者'] || '',
                        establishment: companyInfo['設立'] || '',
                        employees: companyInfo['従業員数'] || '',
                        revenue: companyInfo['売上高'] || '',
                        phone: companyInfo['企業代表番号'] || '',
                        address: normalizedAddress,
                        area: this.extractAreaFromAddress(normalizedAddress),
                        homepage_url: companyInfo['企業HP'] || '',
                        industry: companyInfo['事業内容'] || '',
                        scrape_status: 'step1_completed',
                    };
                }
                catch (err) {
                    log(`Error scraping job: ${err.message}`);
                    continue;
                }
            }
            // 検索結果ページに戻る
            log('Returning to search results...');
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            try {
                await page.waitForLoadState('networkidle', { timeout: 15000 });
            }
            catch {
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
                }
                else {
                    log('Clicking next page...');
                    await nextButton.click();
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 15000 });
                    }
                    catch {
                        // タイムアウトは無視
                    }
                    await page.waitForTimeout(3000);
                }
            }
            else {
                log('No next page button found');
                hasNext = false;
            }
        }
        log(`Completed scraping ${pageNum} pages`);
    }
    // 募集要項テーブルから情報を抽出
    async extractJobDetails(page, log) {
        const details = {};
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
                    if (await labelEl.count() === 0)
                        continue;
                    const label = (await labelEl.textContent())?.trim() || '';
                    if (!label)
                        continue;
                    // 内容: td[class*="styles_content"]
                    const contentEl = row.locator('td[class*="styles_content"]');
                    if (await contentEl.count() === 0)
                        continue;
                    const content = (await contentEl.textContent())?.trim() || '';
                    details[label] = content;
                }
                catch {
                    // 個別行のエラーは無視
                }
            }
        }
        catch (error) {
            log(`Error extracting job details: ${error.message}`);
        }
        return details;
    }
    // 企業情報を抽出
    async extractCompanyInfo(page, log) {
        const info = {};
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
                            if (!label)
                                continue;
                            const contentEl = row.locator('td');
                            // リンクがある場合はhrefを取得
                            const linkEl = contentEl.locator('a');
                            if (await linkEl.count() > 0) {
                                const href = await linkEl.getAttribute('href');
                                // 外部リンクの場合はURLを保存
                                if (href && !href.includes('rikunabi.com')) {
                                    info[label] = href;
                                }
                                else {
                                    info[label] = (await contentEl.textContent())?.trim() || '';
                                }
                            }
                            else {
                                info[label] = (await contentEl.textContent())?.trim() || '';
                            }
                        }
                        catch {
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
                    if (await labelEl.count() === 0)
                        continue;
                    const label = (await labelEl.textContent())?.trim() || '';
                    if (!label)
                        continue;
                    // 内容: td
                    const contentEl = row.locator('td');
                    if (await contentEl.count() === 0)
                        continue;
                    // リンクがある場合はhrefを取得 (企業HPなど)
                    const linkEl = contentEl.locator('a');
                    if (await linkEl.count() > 0) {
                        const href = await linkEl.getAttribute('href');
                        // 外部リンクの場合はURLを保存
                        if (href && !href.includes('rikunabi.com')) {
                            info[label] = href;
                        }
                        else {
                            info[label] = (await contentEl.textContent())?.trim() || '';
                        }
                    }
                    else {
                        info[label] = (await contentEl.textContent())?.trim() || '';
                    }
                }
                catch {
                    // 個別行のエラーは無視
                }
            }
        }
        catch (error) {
            log(`Error extracting company info: ${error.message}`);
        }
        return info;
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
