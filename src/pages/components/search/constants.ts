import type { BudgetRank } from '@/types';

// ランク選択オプション
export const rankOptions: { rank: BudgetRank; label: string; icon: string; color: string }[] = [
    { rank: 'A', label: '高予算層 (プレミアム枠)', icon: '⭐', color: 'bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700' },
    { rank: 'B', label: '中予算層 (1ページ目)', icon: '🔵', color: 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700' },
    { rank: 'C', label: '低予算層 (2ページ目以降)', icon: '⚪', color: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600' },
];

// 地方と都道府県のマッピング
export const regionPrefectures: Record<string, string[]> = {
    '北海道': ['北海道'],
    '東北': ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
    '関東': ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
    '甲信越': ['新潟県', '山梨県', '長野県'],
    '北陸': ['富山県', '石川県', '福井県'],
    '東海': ['岐阜県', '静岡県', '愛知県', '三重県'],
    '関西': ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
    '中国': ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
    '四国': ['徳島県', '香川県', '愛媛県', '高知県'],
    '九州・沖縄': ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
};

export const regions = Object.keys(regionPrefectures);

// 職種カテゴリ（15統合カテゴリ）
export const jobTypeCategories = [
    { id: 'sales', name: '営業・販売・カスタマー対応', icon: '💼' },
    { id: 'planning', name: '企画・マーケティング・経営', icon: '📊' },
    { id: 'office', name: '事務・管理・アシスタント', icon: '📝' },
    { id: 'it', name: 'ITエンジニア・Web・ゲーム', icon: '💻' },
    { id: 'electric', name: '電気・電子・機械・半導体・制御', icon: '⚡' },
    { id: 'chemical', name: '化学・素材・食品・医薬', icon: '🧪' },
    { id: 'construction', name: '建築・土木・設備・プラント・不動産技術', icon: '🏗️' },
    { id: 'creative', name: 'クリエイティブ・デザイン', icon: '🎨' },
    { id: 'consulting', name: 'コンサルタント・専門職', icon: '📈' },
    { id: 'finance', name: '金融専門職', icon: '💰' },
    { id: 'medical', name: '医療・介護・福祉', icon: '🏥' },
    { id: 'education', name: '教育・保育・公共サービス', icon: '📚' },
    { id: 'service', name: 'サービス・外食・レジャー・美容・ホテル・交通', icon: '🛎️' },
    { id: 'logistics', name: '物流・運輸・技能工・設備・製造', icon: '🚚' },
    { id: 'public', name: '公務員・団体職員・その他', icon: '🏛️' },
];

// 給与フィルターオプション
export const salaryOptions = [
    { value: 'all', label: '指定なし' },
    { value: '300', label: '300万円以上' },
    { value: '400', label: '400万円以上' },
    { value: '500', label: '500万円以上' },
    { value: '600', label: '600万円以上' },
    { value: '700', label: '700万円以上' },
    { value: '800', label: '800万円以上' },
    { value: '1000', label: '1,000万円以上' },
];

// 企業規模フィルターオプション（範囲指定）
export const employeeOptions = [
    { value: 'all', label: '指定なし' },
    { value: '0-10', label: '0〜10人' },
    { value: '10-50', label: '10〜50人' },
    { value: '50-100', label: '50〜100人' },
    { value: '100-300', label: '100〜300人' },
    { value: '300-500', label: '300〜500人' },
    { value: '500-1000', label: '500〜1,000人' },
    { value: '1000-', label: '1,000人以上' },
];

// 求人更新日フィルターオプション
export const jobUpdatedOptions = [
    { value: 'all', label: '指定なし' },
    { value: '3', label: '3日以内' },
    { value: '7', label: '1週間以内' },
    { value: '14', label: '2週間以内' },
    { value: '30', label: '1ヶ月以内' },
];

// サイト情報
export const siteInfo = {
    mynavi: {
        name: 'マイナビ転職',
        color: 'bg-sky-500',
        lightBg: 'bg-sky-50 dark:bg-sky-950',
        border: 'border-sky-200 dark:border-sky-800',
        text: 'text-sky-700 dark:text-sky-300',
        selectedBg: 'bg-sky-100 dark:bg-sky-900',
        selectedBorder: 'border-sky-500',
    },
    rikunabi: {
        name: 'リクナビNEXT',
        color: 'bg-emerald-500',
        lightBg: 'bg-emerald-50 dark:bg-emerald-950',
        border: 'border-emerald-200 dark:border-emerald-800',
        text: 'text-emerald-700 dark:text-emerald-300',
        selectedBg: 'bg-emerald-100 dark:bg-emerald-900',
        selectedBorder: 'border-emerald-500',
    },
    doda: {
        name: 'doda',
        color: 'bg-orange-500',
        lightBg: 'bg-orange-50 dark:bg-orange-950',
        border: 'border-orange-200 dark:border-orange-800',
        text: 'text-orange-700 dark:text-orange-300',
        selectedBg: 'bg-orange-100 dark:bg-orange-900',
        selectedBorder: 'border-orange-500',
    },
} as const;

export type SiteKey = keyof typeof siteInfo;
