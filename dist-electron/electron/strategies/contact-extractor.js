"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactExtractor = void 0;
// ランダム待機時間のヘルパー関数
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
class ContactExtractor {
    REQUEST_INTERVAL = 1500; // 1.5秒（高速化）
    TIMEOUT = 15000; // 15秒タイムアウト（延長）
    // 電話番号の正規表現パターン（優先度順・拡張版）
    PHONE_PATTERNS = [
        // ハイフン区切り
        /0\d{1,4}-\d{1,4}-\d{4}/g,
        // ハイフンなし10-11桁
        /(?<![0-9])0\d{9,10}(?![0-9])/g,
        // カッコ区切り (0X)XXXX-XXXX
        /\(0\d{1,4}\)\s*\d{1,4}-\d{4}/g,
        // スペース区切り
        /0\d{1,4}\s+\d{1,4}\s+\d{4}/g,
        // TEL:プレフィックス付き
        /TEL[:\s：]*0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/gi,
        /電話[:\s：]*0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/gi,
        // 全角数字（変換して処理）
        /０\d{1,4}[ー－-]\d{1,4}[ー－-]\d{4}/g,
    ];
    // メールアドレスの正規表現パターン
    EMAIL_PATTERNS = [
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        /[a-zA-Z0-9._%+-]+\[at\][a-zA-Z0-9.-]+\[dot\][a-zA-Z]{2,}/g
    ];
    // 優先的にチェックするセレクタ（拡張版）
    TARGET_SELECTORS = [
        // 会社情報セクション
        '.company-info',
        '.companyInfo',
        '[class*="company"]',
        '[class*="corporate"]',
        // お問い合わせ・連絡先
        '.contact',
        '[class*="contact"]',
        '[class*="inquiry"]',
        // フッター
        'footer',
        '[class*="footer"]',
        // テーブル（会社概要でよく使われる）
        'table',
        // 定義リスト（会社情報でよく使われる）
        'dl',
        // アドレス要素
        'address',
        // その他
        '[class*="about"]',
        '[class*="access"]',
        '[class*="profile"]',
        '.overview',
        '#company',
        '#access',
    ];
    // 日本の企業サイトでよく使われるURLパス（拡張版）
    PAGE_PATHS = [
        { path: '/company/', name: '会社概要' },
        { path: '/corporate/', name: '企業情報' },
        { path: '/about/', name: 'About' },
        { path: '/aboutus/', name: 'About Us' },
        { path: '/profile/', name: 'プロフィール' },
        { path: '/outline/', name: '概要' },
        { path: '/info/', name: '情報' },
        { path: '/access/', name: 'アクセス' },
        { path: '/contact/', name: 'お問い合わせ' },
        { path: '/inquiry/', name: 'お問い合わせ' },
        { path: '/company/outline/', name: '会社概要' },
        { path: '/company/profile/', name: '会社プロフィール' },
        { path: '/company/access/', name: '会社アクセス' },
        { path: '/corporate/profile/', name: '企業プロフィール' },
        { path: '/corporate/outline/', name: '企業概要' },
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
            // まずトップページをチェック（多くの場合フッターに電話番号がある）
            try {
                log(`Checking トップページ: ${companyUrl}`);
                await page.goto(companyUrl, { waitUntil: 'domcontentloaded', timeout: this.TIMEOUT });
                await page.waitForTimeout(randomDelay(500, 1000));
                // 404チェック
                const is404Top = await this.check404(page);
                if (!is404Top) {
                    result.phoneNumber = await this.extractPhoneNumber(page, log);
                    if (result.phoneNumber) {
                        log(`Found phone on top page: ${result.phoneNumber}`);
                    }
                    result.email = await this.extractEmail(page, log);
                    if (result.email) {
                        log(`Found email on top page: ${result.email}`);
                    }
                }
            }
            catch (error) {
                log(`Error checking top page: ${error}`);
            }
            // 電話番号が見つかっていない場合、他のページをチェック
            if (!result.phoneNumber) {
                for (const pageInfo of this.PAGE_PATHS) {
                    // 既に見つかったら終了
                    if (result.phoneNumber && result.email) {
                        break;
                    }
                    const pageUrl = this.buildUrl(companyUrl, pageInfo.path);
                    try {
                        log(`Checking ${pageInfo.name}: ${pageUrl}`);
                        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: this.TIMEOUT });
                        await page.waitForTimeout(randomDelay(300, 700));
                        // 404チェック
                        const is404 = await this.check404(page);
                        if (is404) {
                            continue;
                        }
                        // 電話番号を抽出
                        if (!result.phoneNumber) {
                            const phone = await this.extractPhoneNumber(page, log);
                            if (phone) {
                                result.phoneNumber = phone;
                                log(`Found phone: ${phone}`);
                            }
                        }
                        // メールアドレスを抽出
                        if (!result.email) {
                            const email = await this.extractEmail(page, log);
                            if (email) {
                                result.email = email;
                                log(`Found email: ${email}`);
                            }
                        }
                        // お問い合わせページURLを記録
                        if ((pageInfo.name === 'お問い合わせ' || pageInfo.path.includes('contact') || pageInfo.path.includes('inquiry')) && !result.contactPageUrl) {
                            result.contactPageUrl = pageUrl;
                        }
                        await page.waitForTimeout(this.REQUEST_INTERVAL);
                    }
                    catch (error) {
                        // タイムアウトやナビゲーションエラーは静かにスキップ
                        continue;
                    }
                }
            }
        }
        catch (error) {
            log(`Error extracting contact info: ${error}`);
        }
        return result;
    }
    /**
     * 404ページかどうかをチェック
     */
    async check404(page) {
        try {
            // URLのステータスコードをチェック（可能な場合）
            const title = await page.title();
            if (/404|not found|ページが見つかりません/i.test(title)) {
                return true;
            }
            // ページ内のテキストをチェック
            const body = await page.locator('body').first();
            const text = await body.textContent();
            if (text && text.length < 500) {
                // 短いページで404関連テキストがある場合
                if (/404|not found|ページが見つかりません|お探しのページ|存在しません/i.test(text)) {
                    return true;
                }
            }
            return false;
        }
        catch {
            return false;
        }
    }
    /**
     * 電話番号を抽出（改良版）
     */
    async extractPhoneNumber(page, log) {
        try {
            // 優先セクションからテキストを取得
            let textToSearch = '';
            for (const selector of this.TARGET_SELECTORS) {
                try {
                    const elements = await page.locator(selector).all();
                    for (const el of elements) {
                        const text = await el.textContent();
                        if (text) {
                            textToSearch += text + '\n';
                        }
                    }
                }
                catch {
                    continue;
                }
            }
            // フォールバック: ページ全体のテキスト
            if (textToSearch.length < 100) {
                try {
                    textToSearch = await page.evaluate(() => document.body.innerText);
                }
                catch {
                    return undefined;
                }
            }
            // 全角数字を半角に変換
            textToSearch = this.normalizeNumbers(textToSearch);
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
            // フィルタリングと正規化
            const filtered = phones
                .map(p => this.normalizePhoneNumber(p))
                .filter(p => {
                // 0570（ナビダイヤル）を除外
                if (p.startsWith('0570')) {
                    return false;
                }
                // 0800（フリーダイヤル）は含める
                // 桁数チェック（ハイフン除去後10-11桁）
                const digits = p.replace(/\D/g, '');
                if (digits.length < 10 || digits.length > 11) {
                    return false;
                }
                return true;
            });
            if (filtered.length === 0) {
                return undefined;
            }
            // 重複除去
            const unique = [...new Set(filtered)];
            // 優先順位付け
            // 1. 0120/0800（フリーダイヤル）を優先
            const freeDial = unique.find(p => p.startsWith('0120') || p.startsWith('0800'));
            if (freeDial) {
                return freeDial;
            }
            // 2. 「代表」「本社」などのキーワード近辺の番号を優先
            for (const phone of unique) {
                const index = textToSearch.indexOf(phone);
                if (index !== -1) {
                    const context = textToSearch.substring(Math.max(0, index - 100), index + phone.length + 50);
                    if (/代表|本社|お問い合わせ|電話番号|TEL|連絡先|総務|受付/i.test(context)) {
                        // FAXでないことを確認
                        if (!/FAX/i.test(context.substring(context.indexOf(phone) - 20, context.indexOf(phone)))) {
                            return phone;
                        }
                    }
                }
            }
            // 3. 最初に見つかった番号を返す（FAXっぽくないもの）
            for (const phone of unique) {
                const index = textToSearch.indexOf(phone);
                if (index !== -1) {
                    const context = textToSearch.substring(Math.max(0, index - 30), index);
                    if (!/FAX|ファックス|ＦＡＸ/i.test(context)) {
                        return phone;
                    }
                }
            }
            // 4. どうしても見つからなければ最初のもの
            return unique[0];
        }
        catch (error) {
            log(`Error extracting phone: ${error}`);
            return undefined;
        }
    }
    /**
     * 電話番号を正規化
     */
    normalizePhoneNumber(phone) {
        return phone
            .replace(/TEL[:\s：]*/gi, '')
            .replace(/電話[:\s：]*/gi, '')
            .replace(/[ー－]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/--+/g, '-')
            .trim();
    }
    /**
     * 全角数字を半角に変換
     */
    normalizeNumbers(text) {
        return text.replace(/[０-９]/g, (char) => {
            return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
        });
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
            // 2. テキストコンテンツから抽出
            let textToSearch = '';
            for (const selector of this.TARGET_SELECTORS) {
                try {
                    const elements = await page.locator(selector).all();
                    for (const el of elements) {
                        const text = await el.textContent();
                        if (text) {
                            textToSearch += text + '\n';
                        }
                    }
                }
                catch {
                    continue;
                }
            }
            // フォールバック: ページ全体のテキスト
            if (textToSearch.length < 100) {
                try {
                    textToSearch = await page.evaluate(() => document.body.innerText);
                }
                catch {
                    return undefined;
                }
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
            const priority = filtered.find(email => /^(info|contact|sales|support)@/i.test(email));
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
            url.search = ''; // クエリパラメータを除去
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
