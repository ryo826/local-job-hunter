import { Page } from 'playwright';

/**
 * ランダムな待機時間を生成
 */
export function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * リトライオプション
 */
interface RetryOptions {
    maxRetries?: number;
    delayMs?: number;
    onRetry?: (error: Error, attempt: number) => void;
}

/**
 * 非同期関数をリトライ付きで実行
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const { maxRetries = 3, delayMs = 3000, onRetry } = options;

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            if (attempt < maxRetries) {
                onRetry?.(error, attempt);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError;
}

/**
 * ページ読み込みオプション
 */
interface PageLoadOptions {
    url: string;
    page: Page;
    maxRetries?: number;
    timeout?: number;
    waitForSelector?: string;
    waitForSelectorTimeout?: number;
    log?: (msg: string) => void;
}

/**
 * ページをリトライ付きで読み込み
 */
export async function loadPageWithRetry(options: PageLoadOptions): Promise<boolean> {
    const {
        url,
        page,
        maxRetries = 3,
        timeout = 30000,
        waitForSelector,
        waitForSelectorTimeout = 15000,
        log = console.log
    } = options;

    return withRetry(
        async () => {
            await page.setExtraHTTPHeaders({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Upgrade-Insecure-Requests': '1',
            });

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
            await page.waitForTimeout(randomDelay(1000, 2000));

            if (waitForSelector) {
                await page.waitForSelector(waitForSelector, { timeout: waitForSelectorTimeout }).catch(() => {
                    log(`Warning: Selector "${waitForSelector}" not found`);
                });
            }

            return true;
        },
        {
            maxRetries,
            delayMs: 3000,
            onRetry: (error, attempt) => {
                log(`Error loading page (${attempt}/${maxRetries}): ${error.message}`);
                log(`Retrying in 3 seconds...`);
            }
        }
    );
}

/**
 * 複数のセレクターから最初に見つかったものを返す
 */
export async function waitForAnySelector(
    page: Page,
    selectors: string[],
    timeout: number = 10000,
    log?: (msg: string) => void
): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
            try {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    log?.(`Found ${count} elements with selector: ${selector}`);
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

/**
 * ページ内のテキストから総件数を抽出
 */
export async function extractTotalCount(
    page: Page,
    selectors: string[],
    log?: (msg: string) => void
): Promise<number | undefined> {
    // 指定されたセレクターを試行
    for (const selector of selectors) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
            const text = await element.textContent();
            if (text) {
                const match = text.match(/([0-9,]+)/);
                if (match) {
                    const num = parseInt(match[1].replace(/,/g, ''), 10);
                    if (!isNaN(num) && num > 0) {
                        log?.(`Total count: ${num}`);
                        return num;
                    }
                }
            }
        }
    }

    // ページ内のテキストから件数を探す（フォールバック）
    const pageText = await page.evaluate(() => document.body.innerText);
    const match = pageText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*件/);
    if (match) {
        const num = parseInt(match[1].replace(/,/g, ''), 10);
        if (!isNaN(num) && num > 0) {
            log?.(`Total count (from page text): ${num}`);
            return num;
        }
    }

    return undefined;
}

/**
 * ブラウザコンテキストの標準設定
 */
export const DEFAULT_BROWSER_CONTEXT_OPTIONS = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    bypassCSP: true,
};

/**
 * 住所から都道府県を抽出
 */
export function extractPrefectureFromAddress(address: string | undefined): string {
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

/**
 * 住所を正規化（郵便番号除去、都道府県から開始）
 */
export function normalizeAddress(address: string | undefined): string | undefined {
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

/**
 * 会社名をクリーンアップ
 */
export function cleanCompanyName(name: string): string {
    return name
        // パイプ以降を削除
        .split(/[|｜]/)[0]
        // プロモーション文を削除
        .replace(/【プライム市場】|【スタンダード市場】|【グロース市場】|【東証一部】|【東証二部】|【TOKYO PRO Market上場】|【急募】|【未経験歓迎】/g, '')
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
}
