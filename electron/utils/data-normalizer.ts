/**
 * データ正規化ユーティリティ
 * 各求人サイトから取得したデータを統一フォーマットに変換
 */

// 業種カテゴリマッピング（キーワードベース）
const industryCategories: { category: string; keywords: string[] }[] = [
    { category: 'IT・通信', keywords: ['IT', 'システム', 'ソフトウェア', 'Web', 'インターネット', '情報処理', 'SaaS', 'クラウド', 'アプリ', 'ネットワーク', '通信', 'セキュリティ', 'AI', '人工知能', 'DX'] },
    { category: 'メーカー・製造', keywords: ['製造', 'メーカー', '機械', '電機', '電子', '部品', '素材', '化学', '鉄鋼', '金属', '自動車', '食品', '医薬品', '化粧品', '繊維', 'アパレル'] },
    { category: '商社・流通・小売', keywords: ['商社', '卸売', '小売', '流通', '百貨店', 'スーパー', 'コンビニ', 'EC', '通販', '専門店', '量販店'] },
    { category: '金融・保険', keywords: ['銀行', '証券', '保険', '金融', 'ファイナンス', '信用金庫', '信託', '投資', 'リース', 'クレジット', 'カード'] },
    { category: '不動産・建設', keywords: ['不動産', '建設', '建築', 'ゼネコン', 'ハウス', '住宅', 'マンション', 'ビル', '土木', '設計', '施工', 'デベロッパー'] },
    { category: '広告・マスコミ・エンタメ', keywords: ['広告', 'マスコミ', 'メディア', '放送', '出版', '印刷', '新聞', 'テレビ', 'ラジオ', '映像', 'エンタメ', 'ゲーム', '音楽', '芸能', 'イベント'] },
    { category: 'コンサルティング', keywords: ['コンサル', 'シンクタンク', '調査', 'リサーチ', '経営', '戦略', '会計', '監査', '税理士', '弁護士', '士業'] },
    { category: '人材・教育', keywords: ['人材', '派遣', '紹介', '採用', '研修', '教育', '学校', '塾', '予備校', 'スクール', '資格', 'eラーニング'] },
    { category: '医療・福祉・介護', keywords: ['医療', '病院', 'クリニック', '福祉', '介護', '薬局', '調剤', 'ヘルスケア', '健康', '歯科', '看護'] },
    { category: 'サービス・飲食・レジャー', keywords: ['サービス', '飲食', 'レストラン', 'ホテル', '旅行', '観光', 'レジャー', 'アミューズメント', '美容', 'エステ', 'ブライダル', '葬儀', '清掃'] },
    { category: '物流・運輸', keywords: ['物流', '運輸', '運送', '倉庫', '配送', '宅配', '貨物', '海運', '航空', '鉄道', 'タクシー', 'バス'] },
    { category: 'エネルギー・インフラ', keywords: ['電力', 'ガス', '石油', 'エネルギー', '水道', 'インフラ', '再生可能', '太陽光', '風力', '原子力'] },
    { category: '官公庁・団体', keywords: ['官公庁', '公務員', '自治体', '団体', '協会', '組合', 'NPO', 'NGO', '財団', '社団'] },
];

/**
 * 業種を正規化
 * @param industry 元の業種テキスト
 * @returns 正規化された業種カテゴリ
 */
export function normalizeIndustry(industry: string | undefined): string {
    if (!industry) return '';

    const text = industry.toLowerCase();

    for (const { category, keywords } of industryCategories) {
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                return category;
            }
        }
    }

    // マッチしない場合は元のテキストの最初の部分を返す
    // 長すぎる場合は切り詰め
    const cleaned = industry
        .replace(/\s+/g, ' ')
        .trim()
        .split(/[、,・\/]/)[0]
        .trim();

    return cleaned.length > 20 ? cleaned.substring(0, 20) + '...' : cleaned;
}

// エリア（都道府県）の正規化マップ
const prefectureAliases: Record<string, string> = {
    '東京': '東京都',
    '大阪': '大阪府',
    '京都': '京都府',
    '北海道': '北海道',
    // 短縮形
    '神奈川': '神奈川県',
    '埼玉': '埼玉県',
    '千葉': '千葉県',
    '愛知': '愛知県',
    '福岡': '福岡県',
    '兵庫': '兵庫県',
    '広島': '広島県',
    '宮城': '宮城県',
};

const allPrefectures = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];

/**
 * エリアを正規化（都道府県名に統一）
 * @param area 元のエリアテキスト
 * @returns 正規化された都道府県名
 */
export function normalizeArea(area: string | undefined): string {
    if (!area) return '';

    const text = area.trim();

    // 完全一致チェック
    if (allPrefectures.includes(text)) {
        return text;
    }

    // エイリアスチェック
    if (prefectureAliases[text]) {
        return prefectureAliases[text];
    }

    // 部分一致で都道府県を探す
    for (const pref of allPrefectures) {
        if (text.includes(pref)) {
            return pref;
        }
    }

    // 短縮形での部分一致
    for (const [alias, pref] of Object.entries(prefectureAliases)) {
        if (text.includes(alias)) {
            return pref;
        }
    }

    return text;
}

// 給与範囲カテゴリ
const salaryRanges = [
    { label: '300万円未満', min: 0, max: 300 },
    { label: '300〜400万円', min: 300, max: 400 },
    { label: '400〜500万円', min: 400, max: 500 },
    { label: '500〜600万円', min: 500, max: 600 },
    { label: '600〜700万円', min: 600, max: 700 },
    { label: '700〜800万円', min: 700, max: 800 },
    { label: '800〜1000万円', min: 800, max: 1000 },
    { label: '1000万円以上', min: 1000, max: Infinity },
];

/**
 * 給与テキストから年収の数値を抽出
 * @param salaryText 給与テキスト
 * @returns { min, max } 万円単位
 */
export function parseSalaryRange(salaryText: string | undefined): { min: number | null; max: number | null } {
    if (!salaryText) return { min: null, max: null };

    // 全角数字を半角に変換
    const text = salaryText.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

    // 月給の場合は年収に換算（×12）
    const isMonthly = text.includes('月給') || text.includes('月収');
    const multiplier = isMonthly ? 12 : 1;

    // パターン1: "400万円〜600万円" or "400〜600万円" or "400万〜600万"
    const rangeMatch = text.match(/(\d+(?:,\d+)?)\s*万?円?\s*[〜~～\-－ー―]+\s*(\d+(?:,\d+)?)\s*万/);
    if (rangeMatch) {
        const min = parseInt(rangeMatch[1].replace(/,/g, ''), 10) * multiplier;
        const max = parseInt(rangeMatch[2].replace(/,/g, ''), 10) * multiplier;
        return { min, max };
    }

    // パターン2: "年収400万円以上" or "400万円以上"
    const minOnlyMatch = text.match(/(\d+(?:,\d+)?)\s*万.*以上/);
    if (minOnlyMatch) {
        const min = parseInt(minOnlyMatch[1].replace(/,/g, ''), 10) * multiplier;
        return { min, max: null };
    }

    // パターン3: "年収600万円" (単一値)
    const singleMatch = text.match(/(\d+(?:,\d+)?)\s*万/);
    if (singleMatch) {
        const value = parseInt(singleMatch[1].replace(/,/g, ''), 10) * multiplier;
        return { min: value, max: value };
    }

    return { min: null, max: null };
}

/**
 * 給与を正規化（範囲カテゴリに変換）
 * @param salaryText 給与テキスト
 * @returns 正規化された給与範囲
 */
export function normalizeSalary(salaryText: string | undefined): string {
    if (!salaryText) return '';

    const { min, max } = parseSalaryRange(salaryText);

    if (min === null) {
        // パースできない場合は元のテキストを整形して返す
        return salaryText
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 30);
    }

    // 範囲カテゴリにマッチング（minを基準）
    for (const range of salaryRanges) {
        if (min >= range.min && min < range.max) {
            return range.label;
        }
    }

    return salaryRanges[salaryRanges.length - 1].label;
}

// 従業員数範囲カテゴリ
const employeeRanges = [
    { label: '〜10名', min: 0, max: 10 },
    { label: '11〜50名', min: 11, max: 50 },
    { label: '51〜100名', min: 51, max: 100 },
    { label: '101〜300名', min: 101, max: 300 },
    { label: '301〜500名', min: 301, max: 500 },
    { label: '501〜1000名', min: 501, max: 1000 },
    { label: '1001〜5000名', min: 1001, max: 5000 },
    { label: '5001名以上', min: 5001, max: Infinity },
];

/**
 * 従業員数テキストから数値を抽出
 * @param employeesText 従業員数テキスト
 * @returns 従業員数
 */
export function parseEmployeeCount(employeesText: string | undefined): number | null {
    if (!employeesText) return null;

    // 全角数字を半角に変換
    const text = employeesText.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

    // カンマ区切りの数値を抽出
    const match = text.match(/(\d+(?:,\d+)?)\s*(?:名|人)/);
    if (match) {
        return parseInt(match[1].replace(/,/g, ''), 10);
    }

    // 単純な数値のみ
    const simpleMatch = text.match(/^(\d+(?:,\d+)?)/);
    if (simpleMatch) {
        return parseInt(simpleMatch[1].replace(/,/g, ''), 10);
    }

    return null;
}

/**
 * 従業員数を正規化（範囲カテゴリに変換）
 * @param employeesText 従業員数テキスト
 * @returns 正規化された従業員数範囲
 */
export function normalizeEmployees(employeesText: string | undefined): string {
    if (!employeesText) return '';

    const count = parseEmployeeCount(employeesText);

    if (count === null) {
        // パースできない場合は元のテキストを整形して返す
        return employeesText
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 20);
    }

    // 範囲カテゴリにマッチング
    for (const range of employeeRanges) {
        if (count >= range.min && count <= range.max) {
            return range.label;
        }
    }

    return employeeRanges[employeeRanges.length - 1].label;
}

/**
 * 全フィールドを正規化
 */
export function normalizeCompanyData(data: {
    industry?: string;
    area?: string;
    salary_text?: string;
    employees?: string;
}): {
    industry: string;
    area: string;
    salary_text: string;
    employees: string;
} {
    return {
        industry: normalizeIndustry(data.industry),
        area: normalizeArea(data.area),
        salary_text: normalizeSalary(data.salary_text),
        employees: normalizeEmployees(data.employees),
    };
}
