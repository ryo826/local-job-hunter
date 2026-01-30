"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactExtractor = void 0;
// ランダム待機時間のヘルパー関数
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
class ContactExtractor {
    REQUEST_INTERVAL = 2000; // 2秒
    TIMEOUT = 30000; // 30秒タイムアウト
    // 電話番号の正規表現パターン（優先度順）
    PHONE_PATTERNS = [
        /0\d{1,4}-\d{1,4}-\d{4}/g, // 0X-XXXX-XXXX
        /0\d{9,10}/g, // 0XXXXXXXXX（ハイフンなし）
        /\(0\d{1,4}\)\d{1,4}-\d{4}/g, // (0X)XXXX-XXXX
        /TEL[:\s]*0\d{1,4}-\d{1,4}-\d{4}/gi // TEL: 0X-XXXX-XXXX
    ];
    // メールアドレスの正規表現パターン
    EMAIL_PATTERNS = [
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        /[a-zA-Z0-9._%+-]+\[at\][a-zA-Z0-9.-]+\[dot\][a-zA-Z]{2,}/g // スパム対策形式
    ];
    // 優先的にチェックするセレクタ
    TARGET_SELECTORS = [
        'footer',
        '.company-info',
        '.contact',
        '[class*="about"]',
        'address',
        '[class*="footer"]',
        '[class*="company"]'
    ];
    /**
     * 企業HPから連絡先情報を抽出
     */
    async extract(page, companyUrl, onLog) {
        const log = (msg) => {
            if (onLog)
                onLog(msg);
            else
                console.log(`[ContactExtractor] ${msg}`);
        };
        const result = {};
        try {
            // 優先ページを順番に探索
            const pagesToCheck = [
                { url: this.buildUrl(companyUrl, '/company/'), name: '会社概要' },
                { url: this.buildUrl(companyUrl, '/about/'), name: 'About' },
                { url: this.buildUrl(companyUrl, '/contact/'), name: 'お問い合わせ' },
                { url: companyUrl, name: 'トップページ' }
            ];
            for (const pageInfo of pagesToCheck) {
                try {
                    log(`Checking ${pageInfo.name}: ${pageInfo.url}`);
                    await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: this.TIMEOUT });
                    await page.waitForTimeout(randomDelay(1000, 2000));
                    // 404チェック
                    const is404 = await page.locator('text=/404|ページが見つかりません|not found/i').count() > 0;
                    if (is404) {
                        log(`404 detected, skipping ${pageInfo.name}`);
                        continue;
                    }
                    // 電話番号を抽出
                    if (!result.phoneNumber) {
                        result.phoneNumber = await this.extractPhoneNumber(page, log);
                        if (result.phoneNumber) {
                            log(`Found phone: ${result.phoneNumber}`);
                        }
                    }
                    // メールアドレスを抽出
                    if (!result.email) {
                        result.email = await this.extractEmail(page, log);
                        if (result.email) {
                            log(`Found email: ${result.email}`);
                        }
                    }
                    // お問い合わせページURLを記録
                    if (pageInfo.name === 'お問い合わせ' && !is404) {
                        result.contactPageUrl = pageInfo.url;
                    }
                    // 両方見つかったら終了
                    if (result.phoneNumber && result.email) {
                        log('Both phone and email found, stopping search');
                        break;
                    }
                    await page.waitForTimeout(this.REQUEST_INTERVAL);
                }
                catch (error) {
                    log(`Error checking ${pageInfo.name}: ${error}`);
                    continue;
                }
            }
        }
        catch (error) {
            log(`Error extracting contact info: ${error}`);
        }
        return result;
    }
    /**
     * 電話番号を抽出
     */
    async extractPhoneNumber(page, log) {
        try {
            // 優先セクションからテキストを取得
            let textToSearch = '';
            for (const selector of this.TARGET_SELECTORS) {
                const elements = await page.locator(selector).all();
                for (const el of elements) {
                    const text = await el.textContent();
                    if (text) {
                        textToSearch += text + '\n';
                    }
                }
            }
            // フォールバック: ページ全体のテキスト
            if (!textToSearch) {
                textToSearch = await page.evaluate(() => document.body.innerText);
            }
            // パターンマッチング
            const phones = [];
            for (const pattern of this.PHONE_PATTERNS) {
                const matches = textToSearch.match(pattern);
                if (matches) {
                    phones.push(...matches);
                }
            }
            if (phones.length === 0) {
                return undefined;
            }
            // フィルタリングと優先順位付け
            const filtered = phones
                .map(p => p.replace(/TEL[:\s]*/gi, '').trim())
                .filter(p => {
                // 0570（ナビダイヤル）を除外
                if (p.startsWith('0570') || p.startsWith('0-570')) {
                    return false;
                }
                // FAX番号を除外（FAXというテキストが近くにある場合）
                return true;
            });
            if (filtered.length === 0) {
                return undefined;
            }
            // 0120（フリーダイヤル）を優先
            const freeDial = filtered.find(p => p.startsWith('0120') || p.startsWith('0-120'));
            if (freeDial) {
                return freeDial;
            }
            // 「代表」「本社」などのキーワード近辺の番号を優先
            for (const phone of filtered) {
                const index = textToSearch.indexOf(phone);
                if (index !== -1) {
                    const context = textToSearch.substring(Math.max(0, index - 50), index + 50);
                    if (/代表|本社|お問い合わせ|電話番号/i.test(context)) {
                        return phone;
                    }
                }
            }
            // 最初に見つかった番号を返す
            return filtered[0];
        }
        catch (error) {
            log(`Error extracting phone: ${error}`);
            return undefined;
        }
    }
    /**
     * メールアドレスを抽出
     */
    async extractEmail(page, log) {
        try {
            // 1. mailto:リンクから抽出
            const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
            if (mailtoLinks.length > 0) {
                const href = await mailtoLinks[0].getAttribute('href');
                if (href) {
                    const email = href.replace('mailto:', '').split('?')[0];
                    if (this.isValidEmail(email)) {
                        return email;
                    }
                }
            }
            // 2. お問い合わせページのリンクをチェック
            const contactLinks = await page.locator('a[href*="contact"]').all();
            for (const link of contactLinks.slice(0, 3)) { // 最初の3つだけチェック
                try {
                    const href = await link.getAttribute('href');
                    if (href && !href.startsWith('javascript:')) {
                        const fullUrl = href.startsWith('http') ? href : new URL(href, page.url()).href;
                        await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: this.TIMEOUT });
                        await page.waitForTimeout(1000);
                        // mailto:リンクを再度チェック
                        const contactMailtoLinks = await page.locator('a[href^="mailto:"]').all();
                        if (contactMailtoLinks.length > 0) {
                            const contactHref = await contactMailtoLinks[0].getAttribute('href');
                            if (contactHref) {
                                const email = contactHref.replace('mailto:', '').split('?')[0];
                                if (this.isValidEmail(email)) {
                                    return email;
                                }
                            }
                        }
                    }
                }
                catch {
                    continue;
                }
            }
            // 3. テキストコンテンツから抽出
            let textToSearch = '';
            for (const selector of this.TARGET_SELECTORS) {
                const elements = await page.locator(selector).all();
                for (const el of elements) {
                    const text = await el.textContent();
                    if (text) {
                        textToSearch += text + '\n';
                    }
                }
            }
            // フォールバック: ページ全体のテキスト
            if (!textToSearch) {
                textToSearch = await page.evaluate(() => document.body.innerText);
            }
            // パターンマッチング
            const emails = [];
            for (const pattern of this.EMAIL_PATTERNS) {
                const matches = textToSearch.match(pattern);
                if (matches) {
                    emails.push(...matches);
                }
            }
            if (emails.length === 0) {
                return undefined;
            }
            // スパム対策テキストの変換
            const converted = emails.map(email => email
                .replace(/\[at\]/g, '@')
                .replace(/\[dot\]/g, '.')
                .replace(/（at）/g, '@')
                .replace(/（dot）/g, '.'));
            // フィルタリング
            const filtered = converted.filter(email => {
                // no-reply, noreplyを除外
                if (/no-?reply/i.test(email)) {
                    return false;
                }
                // 有効なメールアドレス形式かチェック
                return this.isValidEmail(email);
            });
            if (filtered.length === 0) {
                return undefined;
            }
            // info@, contact@, sales@ を優先
            const priority = filtered.find(email => /^(info|contact|sales)@/i.test(email));
            if (priority) {
                return priority;
            }
            // 最初に見つかったメールアドレスを返す
            return filtered[0];
        }
        catch (error) {
            log(`Error extracting email: ${error}`);
            return undefined;
        }
    }
    /**
     * URLを構築
     */
    buildUrl(baseUrl, path) {
        try {
            const url = new URL(baseUrl);
            url.pathname = path;
            return url.href;
        }
        catch {
            return baseUrl + path;
        }
    }
    /**
     * メールアドレスの妥当性チェック
     */
    isValidEmail(email) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    }
}
exports.ContactExtractor = ContactExtractor;
