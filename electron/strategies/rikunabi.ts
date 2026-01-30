import { Page } from 'playwright';
import { ScrapingStrategy, CompanyData, ScrapingParams } from './ScrapingStrategy';

// ランダム待機時間のヘルパー関数
function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class RikunabiStrategy implements ScrapingStrategy {
    readonly source = 'rikunabi';

    // レート制限設定
    private readonly REQUEST_INTERVAL = 5000;  // 5秒
    private readonly PAGE_INTERVAL = 8000;     // 8秒

    async *scrape(page: Page, params: ScrapingParams, onLog?: (message: string) => void): AsyncGenerator<CompanyData> {
        const { keywords, location } = params;

        const log = (msg: string) => {
            if (onLog) onLog(msg);
            else console.log(`[Rikunabi] ${msg}`);
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

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(randomDelay(3000, 5000));

                // 求人カードが表示されるまで待機
                await page.waitForSelector('[class*="styles_detailArea"], [class*="jobCard"]', { timeout: 15000 }).catch(() => {
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

        let hasNext = true;
        let pageNum = 0;
        const maxPages = 5;

        while (hasNext && pageNum < maxPages) {
            pageNum++;
            log(`Scraping page ${pageNum}...`);

            // スクロールしてコンテンツ読み込み
            await this.scrollToBottom(page, log);

            // 求人カードを取得 (CSS Modulesのハッシュ付きクラス名に対応)
            const jobCards = await page.locator('[class*="styles_detailArea"], [class*="jobCard"], article').all();
            log(`Found ${jobCards.length} job cards`);

            if (jobCards.length === 0) {
                log('No job cards found, stopping');
                break;
            }

            for (const card of jobCards) {
                try {
                    // 会社名を取得
                    const companyNameEl = card.locator('[class*="employerName"], [class*="companyName"]').first();
                    let companyName = (await companyNameEl.textContent())?.trim() || '';

                    if (!companyName) {
                        log('No company name found, skipping');
                        continue;
                    }

                    // 職種を取得
                    const jobTitleEl = card.locator('h2[class*="title"], [class*="heading"]').first();
                    const jobTitle = (await jobTitleEl.textContent())?.trim() || '';

                    // 勤務地を取得
                    const locationEl = card.locator('p[data-content="location"], [class*="location"]').first();
                    const locationText = (await locationEl.textContent())?.trim() || '';

                    // 給与を取得
                    const salaryEl = card.locator('p[data-content="salary"], [class*="salary"]').first();
                    const salaryText = (await salaryEl.textContent())?.trim() || '';

                    log(`Found: ${companyName}`);

                    // カードをクリックして詳細ページへ
                    await page.waitForTimeout(this.REQUEST_INTERVAL);

                    // カード内のリンクまたはカード自体をクリック
                    const cardLink = card.locator('a').first();
                    let detailUrl = '';

                    if (await cardLink.count() > 0) {
                        detailUrl = await cardLink.getAttribute('href') || '';
                    }

                    if (!detailUrl) {
                        // カード全体がクリック可能な場合
                        try {
                            await card.click();
                            await page.waitForTimeout(randomDelay(3000, 5000));
                            detailUrl = page.url();
                        } catch (clickError) {
                            log(`Could not click card: ${clickError}`);
                            continue;
                        }
                    } else {
                        const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://next.rikunabi.com${detailUrl}`;
                        log(`Visiting detail page: ${fullUrl}`);

                        try {
                            await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForTimeout(randomDelay(3000, 5000));
                        } catch (navError: any) {
                            log(`Navigation error: ${navError.message}, skipping`);
                            continue;
                        }
                    }

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
                        } catch (error) {
                            log(`Could not click company tab: ${error}`);
                        }
                    }

                    // 企業情報を抽出
                    const address = await this.extractTextByLabel(page, '本社所在地') ||
                        await this.extractTextByLabel(page, '所在地') ||
                        await this.extractTextByLabel(page, '勤務地') ||
                        locationText;
                    const industry = await this.extractTextByLabel(page, '事業内容') ||
                        await this.extractTextByLabel(page, '業種');
                    const employees = await this.extractTextByLabel(page, '従業員数');
                    const establishment = await this.extractTextByLabel(page, '設立');
                    const representative = await this.extractTextByLabel(page, '代表者');
                    const revenue = await this.extractTextByLabel(page, '売上高');
                    const phone = await this.extractTextByLabel(page, '企業代表番号') ||
                        await this.extractTextByLabel(page, '電話番号');
                    const detailSalary = await this.extractTextByLabel(page, '給与') ||
                        await this.extractTextByLabel(page, '月給') ||
                        salaryText;

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

            // ページネーション
            const nextButton = page.locator('a:has-text("次へ"), a:has-text("次のページ"), a[rel="next"], [class*="next"] a').first();
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

    // スクロールしてコンテンツを読み込み
    private async scrollToBottom(page: Page, log: (msg: string) => void): Promise<void> {
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
        } catch (error) {
            log(`Error during scroll: ${error}`);
        }
    }

    // ラベルからテキストを抽出
    private async extractTextByLabel(page: Page, label: string): Promise<string | undefined> {
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

        } catch (error) {
            // ignore
        }
        return undefined;
    }

    // テキストをクリーンアップ
    private cleanText(text: string | null): string | undefined {
        if (!text) return undefined;
        return text
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '')
            .trim() || undefined;
    }

    // 企業URLを抽出
    private async extractCompanyUrl(page: Page): Promise<string | undefined> {
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
}
