import { Page, Locator, BrowserContext } from 'playwright';
import { ScrapingStrategy, CompanyData, ScrapingParams, ScrapingCallbacks, BudgetRank, JobCardInfo } from './ScrapingStrategy';
import { normalizeIndustry, normalizeArea, normalizeSalary, normalizeEmployees } from '../utils/data-normalizer';

// ランダム待機時間のヘルパー関数
function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ランク判定結果
interface RankResult {
    rank: BudgetRank;
    confidence: number;
}

// 日付情報
interface DodaJobDates {
    updateDate: Date | null;    // 更新日
    periodStart: Date | null;   // 掲載開始日
    periodEnd: Date | null;     // 掲載終了日
}

// 日付文字列をパース（フォーマット: YYYY/MM/DD または YYYY/M/D）
function parseJapaneseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        return new Date(year, month - 1, day);
    } catch {
        return null;
    }
}

// dodaの詳細ページから日付情報を抽出
// 例: "掲載予定期間：2026/2/2（月）～2026/2/8（日）更新日：2026/2/2（月）"
async function extractDodaJobDates(page: Page): Promise<DodaJobDates> {
    try {
        const dateText = await page.evaluate(() => {
            // 日付コンテナを探す
            const selectors = [
                '.jobSearchDetail-heading__publishingDate',
                '[class*="publishingDate"]',
                '.detailPublish',
            ];
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el?.textContent) {
                    return el.textContent;
                }
            }
            return null;
        });

        if (!dateText) {
            return { updateDate: null, periodStart: null, periodEnd: null };
        }

        // 掲載予定期間を抽出
        const periodRegex = /掲載予定期間[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})[（(][月火水木金土日][）)]\s*[～〜ー-]\s*(\d{4}\/\d{1,2}\/\d{1,2})/;
        const updateRegex = /更新日[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/;

        const periodMatch = dateText.match(periodRegex);
        const updateMatch = dateText.match(updateRegex);

        return {
            periodStart: periodMatch ? parseJapaneseDate(periodMatch[1]) : null,
            periodEnd: periodMatch ? parseJapaneseDate(periodMatch[2]) : null,
            updateDate: updateMatch ? parseJapaneseDate(updateMatch[1]) : null,
        };
    } catch {
        return { updateDate: null, periodStart: null, periodEnd: null };
    }
}

// dodaのランク判定ロジック
// 判定基準: 表示順位（絶対位置）
// - A級: 1〜20位 (displayIndex 0-19)
// - B級: 21〜100位 (displayIndex 20-99)
// - C級: 101位以降 (displayIndex 100+)
// PR枠URLは最優先でA級
async function classifyDoda(card: Locator, displayIndex: number): Promise<RankResult> {
    try {
        // 1. PR枠のURL判定（最優先）
        const linkEl = card.locator('a.jobCard-header__link').first();
        const href = await linkEl.getAttribute('href');
        const isPR = href?.includes('-tab__pr/') ?? false;

        if (isPR) {
            return { rank: 'A', confidence: 0.95 };  // PR枠(確定)
        }

        // 2. 表示順位による判定
        if (displayIndex < 20) {
            return { rank: 'A', confidence: 0.9 };  // 1〜20位
        } else if (displayIndex < 100) {
            return { rank: 'B', confidence: 0.7 };  // 21〜100位
        } else {
            return { rank: 'C', confidence: 0.5 };  // 101位以降
        }
    } catch (error) {
        console.warn(`Rank classification failed: ${error}`);
        return { rank: 'C', confidence: 0.3 }; // デフォルトで最下位ランク
    }
}

// doda都道府県コードマッピング（JISコード準拠）
// URL形式: /DodaFront/View/JobSearchList/j_pr__{コード}/
const prefectureCodes: Record<string, string> = {
    '北海道': '01',
    '青森県': '02',
    '岩手県': '03',
    '宮城県': '04',
    '秋田県': '05',
    '山形県': '06',
    '福島県': '07',
    '茨城県': '08',
    '栃木県': '09',
    '群馬県': '10',
    '埼玉県': '11',
    '千葉県': '12',
    '東京都': '13',
    '神奈川県': '14',
    '新潟県': '15',
    '富山県': '16',
    '石川県': '17',
    '福井県': '18',
    '山梨県': '19',
    '長野県': '20',
    '岐阜県': '21',
    '静岡県': '22',
    '愛知県': '23',
    '三重県': '24',
    '滋賀県': '25',
    '京都府': '26',
    '大阪府': '27',
    '兵庫県': '28',
    '奈良県': '29',
    '和歌山県': '30',
    '鳥取県': '31',
    '島根県': '32',
    '岡山県': '33',
    '広島県': '34',
    '山口県': '35',
    '徳島県': '36',
    '香川県': '37',
    '愛媛県': '38',
    '高知県': '39',
    '福岡県': '40',
    '佐賀県': '41',
    '長崎県': '42',
    '熊本県': '43',
    '大分県': '44',
    '宮崎県': '45',
    '鹿児島県': '46',
    '沖縄県': '47',
};

// doda職種カテゴリマッピング（Lサフィックス付き）
// URL形式: /-oc__{コード}L/
const jobTypeCodes: Record<string, string> = {
    // サイト固有の名称
    '営業': '01L',
    '企画・管理': '02L',
    'SE/インフラエンジニア/Webエンジニア': '03L',
    '機械/電気': '04L',
    '化学/素材/化粧品 ほか': '05L',
    '建築/土木/不動産/プラント/設備': '06L',
    'コンサルタント/士業': '07L',
    'クリエイティブ': '08L',
    '販売/サービス': '09L',
    '公務員/教員 ほか': '10L',
    '事務/アシスタント': '11L',
    '医療系専門職': '12L',
    '金融専門職': '13L',
    '組み込みソフトウェア': '14L',
    '食品/香料/飼料 ほか': '15L',
    // 15統合カテゴリからのエイリアス
    '営業・販売・カスタマー対応': '01L',               // ① 営業職
    '企画・マーケティング・経営': '02L',               // ② 企画・管理
    '事務・管理・アシスタント': '11L',                 // ③ 事務・アシスタント
    'ITエンジニア・Web・ゲーム': '03L',                // ④ SE・インフラエンジニア・Webエンジニア
    '電気・電子・機械・半導体・制御': '04L',           // ⑤ 機械・電気
    '化学・素材・食品・医薬': '05L',                   // ⑥ 化学・素材・化粧品 ほか
    '建築・土木・設備・プラント・不動産技術': '06L',   // ⑦ 建築・土木・不動産・プラント・設備
    'クリエイティブ・デザイン': '08L',                 // ⑧ クリエイティブ
    'コンサルタント・専門職': '07L',                   // ⑨ コンサルタント・士業
    '医療・介護・福祉': '12L',                         // ⑪ 医療系専門職
    '教育・保育・公共サービス': '10L',                 // ⑫ 公務員・教員 ほか
    'サービス・外食・レジャー・美容・ホテル・交通': '09L', // ⑬ 販売・サービス
    '物流・運輸・技能工・設備・製造': '09L',           // ⑭ 販売・サービス（dodaは該当カテゴリなし）
    '公務員・団体職員・その他': '10L',                 // ⑮ 公務員・教員 ほか
};

export class DodaStrategy implements ScrapingStrategy {
    readonly source = 'doda';

    // レート制限設定
    private readonly REQUEST_INTERVAL = 1500;  // 1.5秒
    private readonly PAGE_INTERVAL = 2000;     // 2秒

    // dodaの年収ドロップダウン選択肢マッピング（実HTML確認済み）
    // 選択肢: 指定しない, 200万円, 250万円, 300万円, 350万円, 400万円, 450万円,
    //         500万円, 550万円, 600万円, 650万円, 700万円, 800万円, 900万円, 1000万円
    private readonly SALARY_OPTIONS: { [key: number]: string } = {
        200: '200万円',
        250: '250万円',
        300: '300万円',
        350: '350万円',
        400: '400万円',
        450: '450万円',
        500: '500万円',
        550: '550万円',
        600: '600万円',
        650: '650万円',
        700: '700万円',
        800: '800万円',
        900: '900万円',
        1000: '1000万円',
    };

    // dodaの従業員数チェックボックス値マッピング
    // value="1" = ～10名, value="2" = 11～100名, value="3" = 101～1000名, value="4" = 1001名～
    private readonly EMPLOYEE_CHECKBOX_VALUES: { min: number; value: string }[] = [
        { min: 1001, value: '4' },    // 1001名～
        { min: 101, value: '3' },     // 101～1000名
        { min: 11, value: '2' },      // 11～100名
        { min: 0, value: '1' },       // ～10名
    ];

    // UI従業員数範囲 → dodaチェックボックス値のマッピング
    // dodaの区分: value="1" = ～10名, value="2" = 11～100名, value="3" = 101～1000名, value="4" = 1001名～
    private readonly EMPLOYEE_RANGE_TO_DODA: Record<string, string[]> = {
        '0-10': ['1'],           // ～10名
        '11-100': ['2'],         // 11～100名
        '101-1000': ['3'],       // 101～1000名
        '1001-': ['4'],          // 1001名～
    };

    // 都道府県からdoda地域へのマッピング
    // dodaの地域: 北海道･東北, 関東, 東海, 北信越, 関西, 中国･四国, 九州・沖縄
    private readonly PREFECTURE_TO_REGION: { [prefecture: string]: string } = {
        // 北海道･東北
        '北海道': '北海道･東北',
        '青森県': '北海道･東北',
        '岩手県': '北海道･東北',
        '宮城県': '北海道･東北',
        '秋田県': '北海道･東北',
        '山形県': '北海道･東北',
        '福島県': '北海道･東北',
        // 関東
        '茨城県': '関東',
        '栃木県': '関東',
        '群馬県': '関東',
        '埼玉県': '関東',
        '千葉県': '関東',
        '東京都': '関東',
        '神奈川県': '関東',
        // 東海
        '岐阜県': '東海',
        '静岡県': '東海',
        '愛知県': '東海',
        '三重県': '東海',
        // 北信越（dodaでは山梨県は関東に分類）
        '新潟県': '北信越',
        '富山県': '北信越',
        '石川県': '北信越',
        '福井県': '北信越',
        '山梨県': '関東',  // dodaでは関東に分類
        '長野県': '北信越',
        // 関西
        '滋賀県': '関西',
        '京都府': '関西',
        '大阪府': '関西',
        '兵庫県': '関西',
        '奈良県': '関西',
        '和歌山県': '関西',
        // 中国･四国
        '鳥取県': '中国･四国',
        '島根県': '中国･四国',
        '岡山県': '中国･四国',
        '広島県': '中国･四国',
        '山口県': '中国･四国',
        '徳島県': '中国･四国',
        '香川県': '中国･四国',
        '愛媛県': '中国･四国',
        '高知県': '中国･四国',
        // 九州・沖縄
        '福岡県': '九州・沖縄',
        '佐賀県': '九州・沖縄',
        '長崎県': '九州・沖縄',
        '熊本県': '九州・沖縄',
        '大分県': '九州・沖縄',
        '宮崎県': '九州・沖縄',
        '鹿児島県': '九州・沖縄',
        '沖縄県': '九州・沖縄',
    };

    // 15統合カテゴリからdoda職種へのマッピング
    // dodaの職種名は occupationCategoryItem__title から取得
    private readonly JOB_TYPE_MAPPING: { [unifiedCategory: string]: string[] } = {
        '営業・販売・カスタマー対応': ['営業職'],
        '企画・マーケティング・経営': ['企画・管理'],
        '事務・管理・アシスタント': ['事務・アシスタント'],
        'ITエンジニア・Web・ゲーム': ['技術職（SE・インフラエンジニア・Webエンジニア）'],
        '電気・電子・機械・半導体・制御': ['技術職（機械・電気）', '技術職（組み込みソフトウェア）'],
        '化学・素材・食品・医薬': ['技術職（化学・素材・化粧品・トイレタリー）', '技術職（食品・香料・飼料）'],
        '建築・土木・設備・プラント・不動産技術': ['技術職・専門職（建設・建築・不動産・プラント・工場）'],
        'クリエイティブ・デザイン': ['クリエイター・クリエイティブ職'],
        'コンサルタント・専門職': ['専門職（コンサルティングファーム・専門事務所・監査法人）'],
        '金融専門職': ['専門職（コンサルティングファーム・専門事務所・監査法人）'],  // 近いカテゴリにマッピング
        '医療・介護・福祉': ['医療系専門職'],
        '教育・保育・公共サービス': ['公務員・教員・農林水産関連職'],
        'サービス・外食・レジャー・美容・ホテル・交通': ['販売・サービス職'],
        '物流・運輸・技能工・設備・製造': ['販売・サービス職'],  // dodaには該当カテゴリなし
        '公務員・団体職員・その他': ['公務員・教員・農林水産関連職'],
    };

    /**
     * 勤務地フィルターを適用
     */
    private async applyLocationFilter(
        page: Page,
        prefectures: string[],
        log: (msg: string) => void
    ): Promise<void> {
        log(`勤務地フィルター設定: ${prefectures.join(', ')}`);

        const locationButton = page.locator('button:has-text("勤務地を選択")').first();
        if (await locationButton.count() === 0) {
            log('勤務地選択ボタンが見つかりません');
            return;
        }

        await locationButton.click();
        await page.waitForSelector('.locationStationModalListItem__listItem', { timeout: 5000 });

        // 都道府県を地域ごとにグループ化
        const prefecturesByRegion = new Map<string, string[]>();
        for (const pref of prefectures) {
            const region = this.PREFECTURE_TO_REGION[pref];
            if (region) {
                if (!prefecturesByRegion.has(region)) {
                    prefecturesByRegion.set(region, []);
                }
                prefecturesByRegion.get(region)!.push(pref);
            }
        }

        // 各地域について処理
        for (const [region, prefs] of prefecturesByRegion) {
            const regionItem = page.locator(`.locationStationModalListItem__listItemTitle:has-text("${region}")`).first();
            if (await regionItem.count() === 0) {
                log(`地域が見つかりません: ${region}`);
                continue;
            }

            const parentDiv = regionItem.locator('xpath=ancestor::div[@role="button"]');
            if (await parentDiv.count() > 0) {
                await parentDiv.click();
                await page.waitForTimeout(800);
                log(`地域展開: ${region}`);

                for (const pref of prefs) {
                    const prefItem = page.locator(`.locationStationModalListItem__listItemTitle:text-is("${pref}")`).first();
                    if (await prefItem.count() > 0) {
                        const prefParentDiv = prefItem.locator('xpath=ancestor::div[@role="button"]');
                        if (await prefParentDiv.count() > 0) {
                            await prefParentDiv.click();
                            await page.waitForTimeout(300);
                            log(`都道府県選択: ${pref}`);
                        }
                    } else {
                        log(`都道府県が見つかりません: ${pref}`);
                    }
                }
            }
        }

        // モーダルを閉じる
        await this.closeModal(page);
        log('勤務地フィルター設定完了');
    }

    /**
     * 年収フィルターを適用
     */
    private async applySalaryFilter(
        page: Page,
        minSalary: number,
        log: (msg: string) => void
    ): Promise<void> {
        log(`年収フィルター設定: ${minSalary}万円以上`);

        // 最も近い選択肢を見つける
        const salaryKeys = Object.keys(this.SALARY_OPTIONS).map(Number).sort((a, b) => a - b);
        let targetSalary = salaryKeys[0];
        for (const key of salaryKeys) {
            if (key <= minSalary) {
                targetSalary = key;
            }
        }
        const salaryText = this.SALARY_OPTIONS[targetSalary];
        if (!salaryText) return;

        const salaryDropdownButton = page.locator('.searchIncomeSelect__wrapper').first()
            .locator('.Select-module_select__contentDisplay__XZv3B');

        if (await salaryDropdownButton.count() === 0) {
            log('年収ドロップダウンが見つかりません');
            return;
        }

        await salaryDropdownButton.click();
        await page.waitForSelector('[role="listbox"]', { timeout: 5000 });

        const optionLocator = page.locator(`[role="option"]:has-text("${salaryText}")`);
        if (await optionLocator.count() > 0) {
            await optionLocator.click();
            await page.waitForTimeout(500);
            log(`年収フィルター設定完了: ${salaryText}以上`);
        } else {
            log(`年収オプションが見つかりません: ${salaryText}`);
            await page.keyboard.press('Escape');
        }
    }

    /**
     * 従業員数フィルターを適用（範囲指定対応）
     */
    private async applyEmployeeRangeFilter(
        page: Page,
        employeeRange: string,
        log: (msg: string) => void
    ): Promise<void> {
        log(`従業員数フィルター設定: ${employeeRange}`);

        // dodaのチェックボックス値を取得
        const dodaValues = this.EMPLOYEE_RANGE_TO_DODA[employeeRange];
        if (!dodaValues || dodaValues.length === 0) {
            log(`未対応の従業員数範囲: ${employeeRange}`);
            return;
        }

        // アコーディオンを開く
        const accordionSelectors = [
            'button:has-text("従業員数")',
            '.accordion__button:has-text("従業員数")',
            '[class*="accordion"]:has-text("従業員数")',
        ];

        for (const selector of accordionSelectors) {
            const accordion = page.locator(selector).first();
            if (await accordion.count() > 0) {
                await accordion.click();
                await page.waitForTimeout(500);
                log('従業員数アコーディオンを展開');
                break;
            }
        }

        // 該当するチェックボックスをチェック
        const dodaLabels: Record<string, string> = {
            '1': '～10名',
            '2': '11～100名',
            '3': '101～1000名',
            '4': '1001名～',
        };

        for (const value of dodaValues) {
            const checkboxSelectors = [
                `li.searchCondition__accordion__list input[value="${value}"]`,
                `input[class*="Checkbox-module"][value="${value}"]`,
                `input[type="checkbox"][value="${value}"]`,
            ];

            for (const selector of checkboxSelectors) {
                const checkbox = page.locator(selector).first();
                if (await checkbox.count() > 0) {
                    const isChecked = await checkbox.isChecked();
                    if (!isChecked) {
                        const label = checkbox.locator('xpath=ancestor::label');
                        if (await label.count() > 0) {
                            await label.click();
                        } else {
                            await checkbox.check({ force: true });
                        }
                        await page.waitForTimeout(300);
                        log(`従業員数チェック: ${dodaLabels[value] || value}`);
                    }
                    break;
                }
            }
        }
    }

    /**
     * 職種フィルターを適用
     */
    private async applyJobTypeFilter(
        page: Page,
        jobTypes: string[],
        log: (msg: string) => void
    ): Promise<void> {
        log(`職種フィルター設定: ${jobTypes.join(', ')}`);

        const jobTypeButton = page.locator('.title-with-button__wrapper:has(.title-with-button__title:has-text("職種")) button:has-text("職種を選択")');
        if (await jobTypeButton.count() === 0) {
            log('職種選択ボタンが見つかりません');
            return;
        }

        await jobTypeButton.click();
        await page.waitForSelector('.occupationCategoryItem', { timeout: 5000 });

        // 15統合カテゴリからdoda職種にマッピングして選択
        for (const unifiedCategory of jobTypes) {
            const dodaCategories = this.JOB_TYPE_MAPPING[unifiedCategory];
            if (!dodaCategories) continue;

            for (const dodaCategory of dodaCategories) {
                const categoryItem = page.locator(`.occupationCategoryItem__title:has-text("${dodaCategory}")`).first();
                if (await categoryItem.count() > 0) {
                    const categoryLink = categoryItem.locator('xpath=ancestor::a');
                    if (await categoryLink.count() > 0) {
                        await categoryLink.click();
                    } else {
                        await categoryItem.click();
                    }
                    await page.waitForTimeout(500);
                    log(`職種選択: ${dodaCategory}`);
                } else {
                    log(`職種が見つかりません: ${dodaCategory}`);
                }
            }
        }

        await this.closeModal(page);
        log('職種フィルター設定完了');
    }

    /**
     * モーダルを閉じる共通処理
     */
    private async closeModal(page: Page): Promise<void> {
        await page.waitForTimeout(500);
        const confirmButton = page.locator('button:has-text("決定"), button:has-text("この条件で検索"), button:has-text("閉じる")').first();
        if (await confirmButton.count() > 0) {
            await confirmButton.click();
            await page.waitForTimeout(1000);
        } else {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }
    }

    /**
     * 検索ボタンをクリックして結果を待機
     */
    private async clickSearchButton(page: Page, log: (msg: string) => void): Promise<boolean> {
        log('検索ボタンをクリック...');
        await page.waitForTimeout(1000);

        // 複数のセレクターを試行
        const buttonSelectors = [
            'button.Button-module_button--green__Zirc1:has-text("検索する")',
            '.search-sidebar__search-area button:has-text("検索する")',
            'button[class*="Button-module_button--green"]:has-text("検索する")',
            'button:has-text("検索する")',
        ];

        for (const selector of buttonSelectors) {
            const searchButton = page.locator(selector).first();
            if (await searchButton.count() > 0 && await searchButton.isVisible()) {
                log(`検索ボタン発見: ${selector}`);
                await searchButton.click();
                await page.waitForTimeout(3000);
                await page.waitForSelector('.jobCard-card', { timeout: 15000 }).catch(() => {
                    log('Warning: Job card not found after filter');
                });
                log('フィルター適用完了');
                return true;
            }
        }

        log('検索ボタンが見つかりません');
        return false;
    }

    /**
     * Playwrightを使ってdodaのサイドバーフィルターを適用
     * 勤務地・職種・年収・従業員数などの条件を設定して検索を実行
     */
    private async applySearchFilters(
        page: Page,
        params: ScrapingParams,
        log: (msg: string) => void
    ): Promise<boolean> {
        const { minSalary, employeeRange, jobTypes, prefectures } = params;

        // フィルター条件がない場合はスキップ
        const hasFilters = minSalary || employeeRange ||
            (jobTypes && jobTypes.length > 0) ||
            (prefectures && prefectures.length > 0);

        if (!hasFilters) {
            log('フィルター条件なし、スキップ');
            return true;
        }

        try {
            log('サイドバーフィルターを適用中...');

            // 各フィルターを順番に適用
            if (prefectures && prefectures.length > 0) {
                await this.applyLocationFilter(page, prefectures, log).catch(e => {
                    log(`勤務地フィルター設定エラー: ${e.message}`);
                    page.keyboard.press('Escape').catch(() => {});
                });
            }

            if (minSalary && minSalary > 0) {
                await this.applySalaryFilter(page, minSalary, log).catch(e => {
                    log(`年収フィルター設定エラー: ${e.message}`);
                });
            }

            // 従業員数範囲フィルター（事前フィルター）
            if (employeeRange) {
                await this.applyEmployeeRangeFilter(page, employeeRange, log).catch(e => {
                    log(`従業員数フィルター設定エラー: ${e.message}`);
                });
            }

            if (jobTypes && jobTypes.length > 0) {
                await this.applyJobTypeFilter(page, jobTypes, log).catch(e => {
                    log(`職種フィルター設定エラー: ${e.message}`);
                    page.keyboard.press('Escape').catch(() => {});
                });
            }

            return await this.clickSearchButton(page, log);
        } catch (error: any) {
            log(`フィルター適用エラー: ${error.message}`);
            return false;
        }
    }

    async *scrape(page: Page, params: ScrapingParams, callbacks?: ScrapingCallbacks): AsyncGenerator<CompanyData> {
        const { onLog, onTotalCount } = callbacks || {};

        const log = (msg: string) => {
            if (onLog) onLog(msg);
            else console.log(`[Doda] ${msg}`);
        };

        // 検索結果ページのURLを構築
        const searchUrl = this.buildSearchUrl(params);
        let currentSearchUrl = searchUrl;

        log(`Navigating to: ${searchUrl}`);

        // HTTP/2エラー対策: 複数回リトライ
        let retries = 3;
        let pageLoaded = false;

        while (retries > 0 && !pageLoaded) {
            try {
                // ページ遷移前に追加ヘッダーを設定
                await page.setExtraHTTPHeaders({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                });

                // domcontentloadedで試行（networkidleより軽量）
                await page.goto(searchUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                // 追加の待機
                await page.waitForTimeout(randomDelay(500, 1000));

                // 求人カードが表示されるまで待機
                await page.waitForSelector('.jobCard-card', { timeout: 15000 }).catch(() => {
                    log('Warning: Job card selector not found, continuing anyway');
                });

                pageLoaded = true;
                log('Page loaded successfully');

                // 総件数を取得してコールバックで報告
                if (onTotalCount) {
                    try {
                        const countElement = page.locator('.search-sidebar__total-count__number').first();
                        if (await countElement.count() > 0) {
                            const text = await countElement.textContent();
                            if (text) {
                                const num = parseInt(text.replace(/,/g, ''), 10);
                                if (!isNaN(num)) {
                                    log(`Total jobs: ${num}`);
                                    onTotalCount(num);
                                }
                            }
                        }
                    } catch (e) {
                        log(`Failed to get total count: ${e}`);
                    }
                }

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

        await page.waitForTimeout(randomDelay(500, 1000));

        // Playwrightでサイドバーフィルターを適用（勤務地・職種・年収・従業員数など）
        const hasFilters = params.minSalary || params.minEmployees ||
            (params.jobTypes && params.jobTypes.length > 0) ||
            (params.prefectures && params.prefectures.length > 0);
        if (hasFilters) {
            const filterApplied = await this.applySearchFilters(page, params, log);
            if (filterApplied) {
                // フィルター適用後の総件数を再取得
                if (onTotalCount) {
                    try {
                        const countElement = page.locator('.search-sidebar__total-count__number').first();
                        if (await countElement.count() > 0) {
                            const text = await countElement.textContent();
                            if (text) {
                                const num = parseInt(text.replace(/,/g, ''), 10);
                                if (!isNaN(num)) {
                                    log(`フィルター適用後の総件数: ${num}`);
                                    onTotalCount(num);
                                }
                            }
                        }
                    } catch (e) {
                        log(`Failed to get filtered count: ${e}`);
                    }
                }
            }
        }

        let hasNext = true;
        let pageNum = 0;
        const maxPages = 500;  // 制限を緩和

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

            for (let displayIndex = 0; displayIndex < jobCards.length; displayIndex++) {
                const card = jobCards[displayIndex];
                try {
                    // ランク判定（PR枠かどうかを確認）
                    const rankResult = await classifyDoda(card, displayIndex);

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

                    try {
                        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(randomDelay(800, 1500));
                    } catch (navError: any) {
                        log(`Navigation error: ${navError.message}, skipping`);
                        continue;
                    }

                    // 404チェック
                    const is404 = await page.locator('text=/404|ページが見つかりません/i').count() > 0;
                    if (is404) {
                        log('404 page detected, skipping');
                        await page.goBack({ waitUntil: 'domcontentloaded' });
                        continue;
                    }

                    // 正しいURL形式: /-tab__jd/-fm__jobdetail/
                    // 会社概要は同じページ内でスクロールした先にある
                    let jobDetailUrl = fullUrl;

                    // URLに-tab__jd/-fm__jobdetail/がない場合は修正
                    if (!fullUrl.includes('-fm__jobdetail')) {
                        if (fullUrl.includes('-tab__')) {
                            jobDetailUrl = fullUrl.replace(/-tab__[a-z]+\/?$/, '-tab__jd/-fm__jobdetail/');
                        } else {
                            jobDetailUrl = fullUrl.replace(/\/?$/, '/-tab__jd/-fm__jobdetail/');
                        }
                        jobDetailUrl = jobDetailUrl.replace(/\/+/g, '/').replace(':/', '://');

                        log(`Navigating to job detail page: ${jobDetailUrl}`);
                        try {
                            await page.goto(jobDetailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForTimeout(randomDelay(500, 1000));
                            log('Job detail page loaded');
                        } catch (error: any) {
                            log(`Failed to navigate to job detail: ${error.message}`);
                        }
                    }

                    // ページ全体をスクロールして会社概要セクションを読み込む
                    log('Scrolling to load company overview section...');
                    await page.evaluate(async () => {
                        // 徐々にスクロールして遅延読み込みをトリガー
                        const scrollStep = 500;
                        let currentPosition = 0;
                        const maxScroll = document.body.scrollHeight;

                        while (currentPosition < maxScroll) {
                            currentPosition += scrollStep;
                            window.scrollTo(0, currentPosition);
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }

                        // 最下部まで確実にスクロール
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await page.waitForTimeout(2000);

                    // 会社概要セクションが表示されるまで待つ
                    try {
                        await page.waitForSelector('a.jobSearchDetail-companyOverview__link, dt', { timeout: 5000 });
                        log('Company overview elements found');
                    } catch {
                        log('Company overview elements not found within timeout');
                    }

                    // 企業情報を抽出 (DescriptionList構造)
                    log('Extracting company URL...');
                    const companyUrl = await this.extractCompanyUrl(page, log);
                    log(`Company URL result: ${companyUrl || 'not found'}`);
                    const address = await this.extractDescriptionValue(page, '本社所在地') ||
                        await this.extractDescriptionValue(page, '所在地') ||
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

                    // 求人ページの日付情報を抽出
                    const jobDates = await extractDodaJobDates(page);

                    yield {
                        source: this.source,
                        url: fullUrl,
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: normalizeSalary(salaryText),
                        representative,
                        establishment,
                        employees: normalizeEmployees(employees),
                        revenue,
                        phone: undefined, // 電話番号はGoogle Maps APIで取得
                        address: normalizedAddress,
                        area: normalizeArea(this.extractAreaFromAddress(normalizedAddress) || locationFromList),
                        homepage_url: companyUrl,
                        industry: normalizeIndustry(industry),
                        scrape_status: 'step1_completed',
                        // ランク情報
                        budget_rank: rankResult.rank,
                        rank_confidence: rankResult.confidence,
                        // 求人ページ更新日情報
                        job_page_updated_at: jobDates.updateDate?.toISOString() || null,
                        job_page_end_date: jobDates.periodEnd?.toISOString() || null,
                    };

                    // リストページに戻る
                    await page.goBack({ waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(randomDelay(500, 1000));

                    // 会社概要タブから戻った場合、さらに戻る必要がある場合
                    const currentUrl = page.url();
                    if (!currentUrl.includes('JobSearchList')) {
                        await page.goBack({ waitUntil: 'domcontentloaded' });
                        await page.waitForTimeout(randomDelay(300, 600));
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

            // ページネーション: 次へボタンを探す
            const nextButton = page.locator('a:has-text("次のページ"), a:has-text("次へ"), a[rel="next"], .pager a:has-text("次")').first();
            if (await nextButton.count() > 0 && await nextButton.isVisible()) {
                try {
                    await nextButton.click();
                    await page.waitForTimeout(randomDelay(1000, 2000));
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

    // 並列スクレイピング用: リストページから求人URLを一括収集
    async collectJobUrls(page: Page, params: ScrapingParams, callbacks?: ScrapingCallbacks): Promise<JobCardInfo[]> {
        const { onLog, onTotalCount } = callbacks || {};
        const log = (msg: string) => onLog ? onLog(msg) : console.log(`[Doda] ${msg}`);

        const searchUrl = this.buildSearchUrl(params);
        log(`Collecting job URLs from: ${searchUrl}`);

        const allJobs: JobCardInfo[] = [];

        // ランクフィルターから収集範囲を計算
        // A: 0-19, B: 20-99, C: 100+
        const rankFilter = params.rankFilter;
        let minPosition = 0;
        let maxPosition = Infinity;

        if (rankFilter && rankFilter.length > 0) {
            // 最小開始位置を計算
            if (!rankFilter.includes('A')) {
                if (rankFilter.includes('B')) {
                    minPosition = 20;  // B開始
                } else if (rankFilter.includes('C')) {
                    minPosition = 100;  // C開始
                }
            }
            // 最大終了位置を計算
            if (!rankFilter.includes('C')) {
                if (rankFilter.includes('B')) {
                    maxPosition = 99;  // Bまで
                } else if (rankFilter.includes('A')) {
                    maxPosition = 19;  // Aまで
                }
            }
            log(`ランクフィルター: ${rankFilter.join(', ')} → 位置 ${minPosition + 1}〜${maxPosition === Infinity ? '無制限' : maxPosition + 1}`);
        }

        // HTTP/2エラー対策: リトライロジック
        let retries = 3;
        let pageLoaded = false;

        while (retries > 0 && !pageLoaded) {
            try {
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

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(randomDelay(500, 1000));
                pageLoaded = true;
            } catch (error: any) {
                retries--;
                log(`Error loading page (${3 - retries}/3): ${error.message}`);
                if (retries > 0) {
                    log(`Retrying in 3 seconds...`);
                    await page.waitForTimeout(3000);
                } else {
                    log(`All retries failed.`);
                    return allJobs;
                }
            }
        }

        // Playwrightでサイドバーフィルターを適用（勤務地・職種・年収・従業員数など）
        const hasFilters = params.minSalary || params.employeeRange ||
            (params.jobTypes && params.jobTypes.length > 0) ||
            (params.prefectures && params.prefectures.length > 0);
        if (hasFilters) {
            await this.applySearchFilters(page, params, log);
        }

        // 総件数を取得
        let totalCount = 0;
        try {
            const countEl = page.locator('.search-sidebar__total-count__number').first();
            if (await countEl.count() > 0) {
                const text = await countEl.textContent();
                if (text) {
                    const num = parseInt(text.replace(/,/g, ''), 10);
                    if (!isNaN(num)) {
                        totalCount = num;
                        log(`Total jobs: ${num}`);
                        if (onTotalCount) onTotalCount(num);
                    }
                }
            }
        } catch (e) {
            log(`Failed to get total count: ${e}`);
        }

        // 0件の場合は早期終了
        if (totalCount === 0) {
            log('該当する求人が0件のため、スクレイピングを終了します');
            return allJobs;
        }

        // 1ページあたりのカード数（dodaは50件/ページ）
        const CARDS_PER_PAGE = 50;

        // 開始ページを計算（最小位置から）
        const startPage = Math.floor(minPosition / CARDS_PER_PAGE) + 1;
        if (startPage > 1) {
            log(`ランクフィルターにより、${startPage}ページ目から収集開始`);
        }

        let hasNext = true;
        let pageNum = 0;
        let globalIndex = 0;  // 全体での位置（ページをまたいで連番）
        const maxPages = 500;  // 制限を緩和（実質無制限）

        // 開始ページまでスキップ
        if (startPage > 1) {
            // ページ遷移用のURLパラメータを使用
            // dodaはページ番号をURLで指定可能: ?page=N
            const currentUrl = page.url();
            const pageUrl = currentUrl.includes('?')
                ? `${currentUrl}&page=${startPage}`
                : `${currentUrl}?page=${startPage}`;
            log(`${startPage}ページ目に直接移動: ${pageUrl}`);

            try {
                await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(randomDelay(500, 1000));
                pageNum = startPage - 1;  // ループで+1されるので
                globalIndex = (startPage - 1) * CARDS_PER_PAGE;
            } catch (error: any) {
                log(`ページスキップ失敗: ${error.message}、1ページ目から開始`);
            }
        }

        while (hasNext && pageNum < maxPages) {
            pageNum++;
            log(`Collecting URLs from page ${pageNum}...`);

            await this.scrollToBottom(page, log);

            // page.evaluate()で全カード情報を一括取得（高速化 + 安定性向上）
            const pageCards = await page.evaluate(() => {
                const cards = document.querySelectorAll('.jobCard-card');
                return Array.from(cards).map(card => {
                    // リンク要素を複数セレクタで探す
                    const linkEl = card.querySelector('a.jobCard-header__link') ||
                        card.querySelector('a[href*="JobSearchDetail"]') ||
                        card.querySelector('a[href*="jid"]') ||
                        card.querySelector('.jobCard-header a') ||
                        card.querySelector('a[href]');
                    const url = linkEl?.getAttribute('href') || null;

                    // 会社名
                    const nameEl = card.querySelector('a.jobCard-header__link h2') ||
                        card.querySelector('.jobCard-header h2') ||
                        card.querySelector('h2');
                    const companyName = nameEl?.textContent?.trim() || '';

                    // 求人タイトル
                    const titleEl = card.querySelector('a.jobCard-header__link p') ||
                        card.querySelector('.jobCard-header p') ||
                        card.querySelector('.jobCard-header__jobTitle');
                    const jobTitle = titleEl?.textContent?.trim() || '';

                    return { url, companyName, jobTitle };
                });
            });
            log(`Found ${pageCards.length} job cards on page ${pageNum}`);

            let noUrlCount = 0;
            let rankFilteredCount = 0;

            for (let i = 0; i < pageCards.length; i++) {
                const displayIndex = globalIndex + i;

                // 最大位置を超えたら収集終了
                if (displayIndex > maxPosition) {
                    log(`位置 ${displayIndex + 1} が最大位置 ${maxPosition + 1} を超えたため、収集終了`);
                    hasNext = false;
                    break;
                }

                // 最小位置未満はスキップ
                if (displayIndex < minPosition) {
                    continue;
                }

                const card = pageCards[i];
                if (!card.url) { noUrlCount++; continue; }

                const fullUrl = card.url.startsWith('http') ? card.url : `https://doda.jp${card.url}`;

                // ランク判定（絶対表示順位ベース + PR枠検出）
                // A級: 1〜20位 or PR枠, B級: 21〜100位, C級: 101位以降
                const isPR = card.url.includes('-tab__pr/') || card.url.includes('/pr/');
                let rank: BudgetRank;
                if (isPR) {
                    rank = 'A';  // PR枠
                } else if (displayIndex < 20) {
                    rank = 'A';  // 1〜20位
                } else if (displayIndex < 100) {
                    rank = 'B';  // 21〜100位
                } else {
                    rank = 'C';  // 101位以降
                }

                // ランクフィルターでフィルタリング（PR枠はAランク扱い）
                if (rankFilter && rankFilter.length > 0 && !rankFilter.includes(rank)) {
                    rankFilteredCount++;
                    continue;
                }

                // 詳細ページURLを事前計算
                let detailUrl = fullUrl;
                if (!fullUrl.includes('-fm__jobdetail')) {
                    if (fullUrl.includes('-tab__')) {
                        detailUrl = fullUrl.replace(/-tab__[a-z]+\/?$/, '-tab__jd/-fm__jobdetail/');
                    } else {
                        detailUrl = fullUrl.replace(/\/?$/, '/-tab__jd/-fm__jobdetail/');
                    }
                    detailUrl = detailUrl.replace(/\/+/g, '/').replace(':/', '://');
                }

                allJobs.push({
                    url: fullUrl,
                    detailUrl,
                    companyName: card.companyName,
                    jobTitle: card.jobTitle,
                    rank,
                    displayIndex,
                });
            }

            // グローバルインデックスを更新
            globalIndex += pageCards.length;

            // 収集終了フラグがセットされている場合はループを抜ける
            if (!hasNext) break;

            // 次のページへ
            const nextButton = page.locator('a:has-text("次のページ"), a:has-text("次へ"), a[rel="next"]').first();
            if (await nextButton.count() > 0 && await nextButton.isVisible()) {
                try {
                    await nextButton.click();
                    await page.waitForTimeout(randomDelay(800, 1500));
                } catch (error) {
                    hasNext = false;
                }
            } else {
                hasNext = false;
            }
        }

        log(`Collected ${allJobs.length} job URLs from ${pageNum} pages`);
        return allJobs;
    }

    // 並列スクレイピング用: 個別の詳細ページをスクレイピング
    async scrapeJobDetail(page: Page, jobInfo: JobCardInfo, log?: (msg: string) => void): Promise<CompanyData | null> {
        const logFn = log || ((msg: string) => console.log(`[Doda] ${msg}`));

        // リトライロジック
        let retries = 1;
        while (retries >= 0) {
            try {
                logFn(`Visiting: ${jobInfo.companyName}`);

                // 詳細ページに直接遷移（二重ナビゲーション回避）
                const targetUrl = jobInfo.detailUrl || jobInfo.url;
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
                await page.waitForTimeout(randomDelay(500, 1000));

            // 404チェック
            const is404 = await page.locator('text=/404|ページが見つかりません/i').count() > 0;
            if (is404) {
                logFn('404 page detected, skipping');
                return null;
            }

            // スクロールして会社概要を読み込み + 全フィールド一括抽出
            const fields = await page.evaluate(async () => {
                // スクロールして遅延読み込みをトリガー
                const scrollStep = 1500;
                let currentPosition = 0;
                const maxScroll = document.body.scrollHeight;
                while (currentPosition < maxScroll) {
                    currentPosition += scrollStep;
                    window.scrollTo(0, currentPosition);
                    await new Promise(resolve => setTimeout(resolve, 30));
                }
                // 少し待ってからDOMを読む
                await new Promise(resolve => setTimeout(resolve, 200));

                // dt/dd構造から全ラベルを一括取得
                const labelMap: Record<string, string> = {};
                const dts = document.querySelectorAll('dt');
                for (const dt of dts) {
                    const label = dt.textContent?.trim();
                    if (!label) continue;

                    // 親要素からddを探す
                    const parent = dt.parentElement;
                    if (parent) {
                        const dd = parent.querySelector('dd');
                        if (dd) {
                            labelMap[label] = dd.textContent?.trim().replace(/\s+/g, ' ') || '';
                        }
                    }
                    // 隣接兄弟ddも試す
                    if (!labelMap[label]) {
                        const nextEl = dt.nextElementSibling;
                        if (nextEl && nextEl.tagName === 'DD') {
                            labelMap[label] = nextEl.textContent?.trim().replace(/\s+/g, ' ') || '';
                        }
                    }
                }

                // 企業URLを取得
                let companyUrl: string | null = null;
                // 方法1: 直接クラスのリンク
                const directLink = document.querySelector('a.jobSearchDetail-companyOverview__link') as HTMLAnchorElement;
                if (directLink?.href && !directLink.href.includes('doda.jp')) {
                    companyUrl = directLink.href;
                }
                // 方法2: dt「企業URL」から
                if (!companyUrl) {
                    for (const dt of dts) {
                        if (dt.textContent?.trim() === '企業URL') {
                            const parent = dt.closest('[class*="columnItem"]');
                            if (parent) {
                                const link = parent.querySelector('a') as HTMLAnchorElement;
                                if (link?.href && !link.href.includes('doda.jp')) {
                                    companyUrl = link.href;
                                    break;
                                }
                            }
                            const dd = dt.nextElementSibling;
                            if (dd?.tagName === 'DD') {
                                const link = dd.querySelector('a') as HTMLAnchorElement;
                                if (link?.href && !link.href.includes('doda.jp')) {
                                    companyUrl = link.href;
                                    break;
                                }
                            }
                        }
                    }
                }
                // 方法3: DescriptionList構造から
                if (!companyUrl) {
                    const columnItems = document.querySelectorAll('[class*="descriptionList__columnItem"]');
                    for (const item of columnItems) {
                        const dtEl = item.querySelector('dt');
                        if (dtEl?.textContent?.trim() === '企業URL') {
                            const link = item.querySelector('a') as HTMLAnchorElement;
                            if (link?.href && !link.href.includes('doda.jp')) {
                                companyUrl = link.href;
                                break;
                            }
                        }
                    }
                }

                // 日付情報を取得
                let updateDateStr: string | null = null;
                let periodEndStr: string | null = null;
                const dateSelectors = [
                    '.jobSearchDetail-heading__publishingDate',
                    '[class*="publishingDate"]',
                    '.detailPublish',
                ];
                let dateText: string | null = null;
                for (const sel of dateSelectors) {
                    const el = document.querySelector(sel);
                    if (el?.textContent) {
                        dateText = el.textContent;
                        break;
                    }
                }
                if (dateText) {
                    const periodRegex = /掲載予定期間[：:]\s*\d{4}\/\d{1,2}\/\d{1,2}[（(][月火水木金土日][）)]\s*[～〜ー-]\s*(\d{4}\/\d{1,2}\/\d{1,2})/;
                    const updateRegex = /更新日[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/;
                    const periodMatch = dateText.match(periodRegex);
                    const updateMatch = dateText.match(updateRegex);
                    if (periodMatch) periodEndStr = periodMatch[1];
                    if (updateMatch) updateDateStr = updateMatch[1];
                }

                return {
                    companyUrl,
                    address: labelMap['本社所在地'] || labelMap['所在地'] || null,
                    industry: labelMap['事業概要'] || labelMap['事業内容'] || null,
                    employees: labelMap['従業員数'] || null,
                    establishment: labelMap['設立'] || null,
                    representative: labelMap['代表者'] || null,
                    revenue: labelMap['売上高'] || null,
                    salary: labelMap['給与'] || labelMap['年収'] || null,
                    updateDateStr,
                    periodEndStr,
                };
            });

            const normalizedAddress = this.normalizeAddress(fields.address || undefined);
            const cleanName = this.cleanCompanyName(jobInfo.companyName);

            // 日付パース
            const updateDate = fields.updateDateStr ? parseJapaneseDate(fields.updateDateStr) : null;
            const periodEnd = fields.periodEndStr ? parseJapaneseDate(fields.periodEndStr) : null;

            return {
                source: this.source,
                url: jobInfo.url,
                company_name: cleanName,
                job_title: jobInfo.jobTitle,
                salary_text: normalizeSalary(fields.salary || undefined),
                representative: fields.representative || undefined,
                establishment: fields.establishment || undefined,
                employees: normalizeEmployees(fields.employees || undefined),
                revenue: fields.revenue || undefined,
                phone: undefined,
                address: normalizedAddress,
                area: normalizeArea(this.extractAreaFromAddress(normalizedAddress)),
                homepage_url: fields.companyUrl || undefined,
                industry: normalizeIndustry(fields.industry || undefined),
                scrape_status: 'step1_completed',
                    budget_rank: jobInfo.rank,
                    rank_confidence: jobInfo.rank === 'A' ? 0.9 : (jobInfo.rank === 'B' ? 0.7 : 0.6),
                    job_page_updated_at: updateDate?.toISOString() || null,
                    job_page_end_date: periodEnd?.toISOString() || null,
                };
            } catch (error: any) {
                retries--;
                if (retries >= 0) {
                    logFn(`Retry for ${jobInfo.companyName}: ${error.message}`);
                    await page.waitForTimeout(1000);
                } else {
                    logFn(`Failed ${jobInfo.companyName}: ${error.message}`);
                    return null;
                }
            }
        }
        return null;
    }

    // リストページの求人カードから情報を抽出
    private async extractInfoFromCard(card: any, label: string): Promise<string | undefined> {
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
        } catch (error) {
            // ignore
        }
        return undefined;
    }

    // スクロールして追加コンテンツを読み込み
    private async scrollToBottom(page: Page, log: (msg: string) => void): Promise<void> {
        try {
            let previousHeight = 0;
            let currentHeight = await page.evaluate(() => document.body.scrollHeight);
            let attempts = 0;
            const maxAttempts = 2;

            while (previousHeight < currentHeight && attempts < maxAttempts) {
                previousHeight = currentHeight;

                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });

                await page.waitForTimeout(randomDelay(500, 1000));

                currentHeight = await page.evaluate(() => document.body.scrollHeight);
                attempts++;
            }
        } catch (error) {
            log(`Error during scroll: ${error}`);
        }
    }

    // 企業URLを抽出 (DescriptionList内の企業URLリンク)
    private async extractCompanyUrl(page: Page, log: (msg: string) => void): Promise<string | undefined> {
        try {
            // ページ内のJavaScriptで直接探す（動的コンテンツ対応）
            const result = await page.evaluate(() => {
                const debug: string[] = [];

                // 方法1: jobSearchDetail-companyOverview__link クラスのリンクを探す
                const directLink = document.querySelector('a.jobSearchDetail-companyOverview__link') as HTMLAnchorElement;
                if (directLink && directLink.href && !directLink.href.includes('doda.jp')) {
                    debug.push(`Found via direct class: ${directLink.href}`);
                    return { url: directLink.href, debug };
                }

                // 方法2: dt要素から「企業URL」を探す
                const dts = document.querySelectorAll('dt');
                debug.push(`Found ${dts.length} dt elements`);

                const dtTexts: string[] = [];
                for (const dt of dts) {
                    const text = dt.textContent?.trim();
                    if (text) dtTexts.push(text);

                    if (text === '企業URL') {
                        // 親のcolumnItemを探す
                        const parent = dt.closest('[class*="columnItem"]');
                        if (parent) {
                            const link = parent.querySelector('a') as HTMLAnchorElement;
                            if (link && link.href && !link.href.includes('doda.jp')) {
                                debug.push(`Found via parent columnItem: ${link.href}`);
                                return { url: link.href, debug };
                            }
                        }

                        // 隣接するdd要素を探す
                        const dd = dt.nextElementSibling;
                        if (dd && dd.tagName === 'DD') {
                            const link = dd.querySelector('a') as HTMLAnchorElement;
                            if (link && link.href && !link.href.includes('doda.jp')) {
                                debug.push(`Found via adjacent dd: ${link.href}`);
                                return { url: link.href, debug };
                            }
                        }
                    }
                }
                debug.push(`dt labels: ${dtTexts.slice(0, 10).join(', ')}`);

                // 方法3: DescriptionList構造から探す
                const columnItems = document.querySelectorAll('[class*="descriptionList__columnItem"]');
                debug.push(`Found ${columnItems.length} columnItems`);

                for (const item of columnItems) {
                    const dt = item.querySelector('dt');
                    if (dt && dt.textContent?.trim() === '企業URL') {
                        const link = item.querySelector('a') as HTMLAnchorElement;
                        if (link && link.href && !link.href.includes('doda.jp')) {
                            debug.push(`Found via columnItem structure: ${link.href}`);
                            return { url: link.href, debug };
                        }
                    }
                }

                debug.push('No company URL found');
                return { url: null, debug };
            });

            // デバッグログ出力
            for (const msg of result.debug) {
                log(`[JS] ${msg}`);
            }

            if (result.url) {
                log(`Found company URL: ${result.url}`);
                return result.url;
            }

            log('No company URL found');
        } catch (error: any) {
            log(`Error extracting company URL: ${error.message}`);
        }
        return undefined;
    }

    // DescriptionList構造からデータを抽出
    private async extractDescriptionValue(page: Page, label: string): Promise<string | undefined> {
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

    private cleanCompanyName(name: string): string {
        let cleaned = name
            // パイプ以降を削除（求人タイトルが含まれている場合）
            .split(/[|｜]/)[0]
            // 【】内のプロモーション文を削除（ただし会社名の一部は残す）
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

    // 検索URLを構築するヘルパーメソッド
    // 注意: dodaはPOST方式でデータ送信するため、URLパラメータでの検索条件指定は限定的
    // 勤務地・職種のみURL指定可能、年収・従業員数は事後フィルターで処理
    private buildSearchUrl(params: ScrapingParams): string {
        const { keywords, prefectures, jobTypes } = params;

        // パスベースのURL構築
        let pathParts: string[] = [];

        // 都道府県（最初の1つを使用）
        if (prefectures && prefectures.length > 0) {
            const prefCode = prefectureCodes[prefectures[0]];
            if (prefCode) {
                pathParts.push(`j_pr__${prefCode}`);
            }
        }

        // 職種（最初の1つを使用）- 組み合わせ時はハイフン付き
        if (jobTypes && jobTypes.length > 0) {
            const jobCode = jobTypeCodes[jobTypes[0]];
            if (jobCode) {
                // 都道府県と組み合わせる場合は -oc__ を使用
                if (pathParts.length > 0) {
                    pathParts.push(`-oc__${jobCode}`);
                } else {
                    pathParts.push(`j_oc__${jobCode}`);
                }
            }
        }

        // URL構築
        let searchUrl = 'https://doda.jp/DodaFront/View/JobSearchList/';
        if (pathParts.length > 0) {
            searchUrl += pathParts.join('/') + '/';
        }

        // キーワードはクエリパラメータで追加
        if (keywords) {
            searchUrl += `?kw=${encodeURIComponent(keywords)}`;
        }

        return searchUrl;
    }

    // 総求人件数を取得（URL直接アクセス版）
    async getTotalJobCount(page: Page, params: ScrapingParams): Promise<number | undefined> {
        const log = (msg: string) => console.log(`[Doda] ${msg}`);

        try {
            // 検索URLを構築して直接アクセス
            const searchUrl = this.buildSearchUrl(params);
            log(`検索URL: ${searchUrl}`);

            await page.setExtraHTTPHeaders({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
            });

            // ページにアクセス
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            log('ページにアクセス完了、要素を待機中...');

            // 総件数要素が表示されるまで待機（複数のセレクターを試行）
            const countSelectors = [
                '.displayJobCount__totalNum',
                '.search-sidebar__total-count__number',
            ];

            let foundSelector: string | null = null;
            for (const selector of countSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 10000 });
                    foundSelector = selector;
                    log(`セレクター ${selector} が見つかりました`);
                    break;
                } catch {
                    log(`セレクター ${selector} は見つかりませんでした`);
                }
            }

            if (!foundSelector) {
                // 求人カードが表示されるまで待機してから再試行
                log('件数要素が見つからないため、求人カードを待機...');
                try {
                    await page.waitForSelector('.jobCard-card', { timeout: 10000 });
                    await page.waitForTimeout(2000);
                } catch {
                    log('求人カードも見つかりませんでした');
                }
            }

            // サイドバーフィルターを適用（年収、従業員数など）
            const hasFilters = params.minSalary || params.employeeRange ||
                (params.jobTypes && params.jobTypes.length > 0) ||
                (params.prefectures && params.prefectures.length > 0);
            if (hasFilters) {
                log('サイドバーフィルターを適用...');
                await this.applySearchFilters(page, params, log);
                await page.waitForTimeout(2000);
            }

            // 総件数を取得
            for (const selector of countSelectors) {
                const element = page.locator(selector).first();
                if (await element.count() > 0) {
                    const text = await element.textContent();
                    log(`${selector} のテキスト: "${text}"`);
                    if (text) {
                        const num = parseInt(text.replace(/,/g, ''), 10);
                        if (!isNaN(num)) {
                            log(`総件数: ${num.toLocaleString()}件`);
                            return num;
                        }
                    }
                }
            }

            // JavaScript経由で取得を試みる
            log('JavaScript経由で件数取得を試行...');
            const jsCount = await page.evaluate(() => {
                const selectors = ['.displayJobCount__totalNum', '.search-sidebar__total-count__number'];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent) {
                        return el.textContent.trim();
                    }
                }
                return null;
            });

            if (jsCount) {
                log(`JavaScript経由で取得: "${jsCount}"`);
                const num = parseInt(jsCount.replace(/,/g, ''), 10);
                if (!isNaN(num)) {
                    log(`総件数: ${num.toLocaleString()}件`);
                    return num;
                }
            }

            log('総件数要素が見つかりませんでした');
            return undefined;
        } catch (error) {
            console.error('Failed to get total job count:', error);
            return undefined;
        }
    }
}
