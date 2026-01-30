"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MynaviStrategy = void 0;
// ランダム待機時間のヘルパー関数
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
class MynaviStrategy {
    source = 'mynavi';
    // レート制限設定
    REQUEST_INTERVAL = 3000; // 3秒
    PAGE_INTERVAL = 5000; // 5秒
    async *scrape(page, params, onLog) {
        const { keywords, location } = params;
        const log = (msg) => {
            if (onLog)
                onLog(msg);
            else
                console.log(`[Mynavi] ${msg}`);
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
            // 求人カードを取得
            const jobCards = await page.locator('.cassetteRecruit, [class*="recruitList"] > li, article[class*="recruit"]').all();
            log(`Found ${jobCards.length} job cards`);
            if (jobCards.length === 0) {
                log('No job cards found, stopping');
                break;
            }
            for (const card of jobCards) {
                try {
                    // 求人詳細ページへのリンクを取得
                    const linkEl = card.locator('a[href*="/job-detail/"], a.recruitTitle, h2 a').first();
                    const url = await linkEl.getAttribute('href');
                    if (!url) {
                        log('No detail link found, skipping');
                        continue;
                    }
                    const fullUrl = url.startsWith('http') ? url : `https://tenshoku.mynavi.jp${url}`;
                    // リストページから基本情報を抽出
                    const companyNameEl = card.locator('.companyName, [class*="company"] h3, .cassetteRecruit__name').first();
                    let companyName = (await companyNameEl.textContent())?.trim() || '';
                    const jobTitleEl = card.locator('.cassetteRecruit__copy, h2, .recruitTitle').first();
                    const jobTitle = (await jobTitleEl.textContent())?.trim() || '';
                    // 詳細ページに移動
                    log(`Visiting: ${fullUrl}`);
                    await page.waitForTimeout(this.REQUEST_INTERVAL); // レート制限
                    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
                    await page.waitForTimeout(randomDelay(2000, 5000)); // 2-5秒待機
                    // 404チェック
                    const is404 = await page.locator('text=/404|ページが見つかりません/i').count() > 0;
                    if (is404) {
                        log('404 page detected, skipping');
                        await page.goBack({ waitUntil: 'networkidle' });
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
                        await this.extractTableValue(page, '年収');
                    // 求人内容を抽出
                    const jobDescriptionEl = page.locator('.jobDescriptionText, [class*="description"], .recruitContents').first();
                    const jobDescription = (await jobDescriptionEl.textContent())?.trim().substring(0, 500) || ''; // 最初の500文字
                    // 住所の正規化（都道府県から始まる形式に）
                    const normalizedAddress = this.normalizeAddress(address);
                    const cleanName = this.cleanCompanyName(companyName);
                    // Step 2: 企業URLがある場合は連絡先情報を抽出
                    let contactInfo = {};
                    let finalScrapeStatus = 'step1_completed';
                    if (companyUrl) {
                        try {
                            log(`Step 2: Extracting contact info from ${companyUrl}`);
                            const { ContactExtractor } = await Promise.resolve().then(() => __importStar(require('./contact-extractor')));
                            const extractor = new ContactExtractor();
                            contactInfo = await extractor.extract(page, companyUrl, onLog);
                            if (contactInfo.phoneNumber || contactInfo.email) {
                                finalScrapeStatus = 'step2_completed';
                                log(`Step 2 completed: phone=${contactInfo.phoneNumber}, email=${contactInfo.email}`);
                            }
                            else {
                                log('Step 2: No contact info found');
                            }
                        }
                        catch (error) {
                            log(`Step 2 error: ${error}`);
                        }
                    }
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
                        phone: contactInfo.phoneNumber || phone,
                        email: contactInfo.email,
                        address: normalizedAddress,
                        area: this.extractAreaFromAddress(normalizedAddress),
                        homepage_url: companyUrl,
                        contact_page_url: contactInfo.contactPageUrl,
                        industry,
                        job_description: jobDescription,
                        scrape_status: finalScrapeStatus,
                    };
                    // リストページに戻る
                    await page.goBack({ waitUntil: 'networkidle' });
                    await page.waitForTimeout(randomDelay(2000, 4000)); // 2-4秒待機
                }
                catch (err) {
                    log(`Error scraping job: ${err}`);
                    try {
                        await page.goBack({ waitUntil: 'networkidle' });
                        await page.waitForTimeout(2000);
                    }
                    catch {
                        // リストページに戻れない場合は再度検索ページへ
                        log('Failed to go back, reloading search page');
                        await page.goto(searchUrl, { waitUntil: 'networkidle' });
                        await page.waitForTimeout(3000);
                        break;
                    }
                    continue;
                }
            }
            // 次のページへ
            await page.waitForTimeout(this.PAGE_INTERVAL); // ページネーション待機
            const nextButton = page.locator('a:has-text("次へ"), .pager__next a, a[rel="next"]').first();
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
    // 企業URLを抽出（複数箇所をチェック）
    async extractCompanyUrl(page) {
        // 優先順位1: 企業ホームページリンク
        const homepageLink = page.locator('a:has-text("企業ホームページ"), a:has-text("コーポレートサイト"), a[href*="http"]:has-text("HP")').first();
        if (await homepageLink.count() > 0) {
            const href = await homepageLink.getAttribute('href');
            if (href && !href.includes('mynavi.jp')) {
                return href;
            }
        }
        // 優先順位2: 会社概要セクションのリンク
        const companySection = page.locator('.companyData, .company-info, [class*="company"]');
        const links = await companySection.locator('a[href^="http"]').all();
        for (const link of links) {
            const href = await link.getAttribute('href');
            if (href && !href.includes('mynavi.jp') && !href.includes('javascript:')) {
                return href;
            }
        }
        return undefined;
    }
    // テーブル形式のデータを抽出
    async extractTableValue(page, label) {
        // dt/dd パターン
        const dtEl = page.locator(`dt:has-text("${label}")`).first();
        if (await dtEl.count() > 0) {
            const ddEl = dtEl.locator('~ dd').first();
            if (await ddEl.count() > 0) {
                return (await ddEl.textContent())?.trim() || undefined;
            }
        }
        // th/td パターン
        const thEl = page.locator(`th:has-text("${label}")`).first();
        if (await thEl.count() > 0) {
            const tdEl = thEl.locator('~ td').first();
            if (await tdEl.count() > 0) {
                return (await tdEl.textContent())?.trim() || undefined;
            }
        }
        // ラベル: 値 パターン
        const labelEl = page.locator(`text=/^${label}[：:]/`).first();
        if (await labelEl.count() > 0) {
            const text = await labelEl.textContent();
            if (text) {
                const match = text.match(new RegExp(`${label}[：:]\\s*(.+)`));
                if (match) {
                    return match[1].trim();
                }
            }
        }
        return undefined;
    }
    // 住所の正規化（都道府県から始まる形式に）
    normalizeAddress(address) {
        if (!address)
            return undefined;
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
        const match = address.match(/([東京大阪京都神奈川埼玉千葉愛知北海道福岡].*?[都道府県市区町村])/);
        return match ? match[1] : '';
    }
}
exports.MynaviStrategy = MynaviStrategy;
