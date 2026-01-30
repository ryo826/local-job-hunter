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
exports.BaseScraper = void 0;
class BaseScraper {
    config;
    browser;
    page;
    constructor(config) {
        this.config = config;
    }
    // 初期化
    async initialize() {
        const playwright = await Promise.resolve().then(() => __importStar(require('playwright')));
        this.browser = await playwright.chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        });
        const context = await this.browser.newContext({
            userAgent: this.config.userAgent,
            locale: 'ja-JP',
            timezoneId: 'Asia/Tokyo',
            viewport: { width: 1920, height: 1080 }
        });
        this.page = await context.newPage();
    }
    // クリーンアップ
    async cleanup() {
        if (this.page)
            await this.page.close();
        if (this.browser)
            await this.browser.close();
    }
    // レート制限
    async wait() {
        await new Promise(resolve => setTimeout(resolve, this.config.rateLimit));
    }
    // 共通エラーハンドリング
    async safeRequest(fn, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            }
            catch (error) {
                console.error(`[${this.config.site}] Attempt ${i + 1} failed:`, error);
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1)));
                }
            }
        }
        return null;
    }
    // ランダム待機時間
    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}
exports.BaseScraper = BaseScraper;
