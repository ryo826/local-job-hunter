import type { BudgetRank } from '@/types';

// ランク定義（ツールチップ用）
export const RANK_DEFINITIONS = {
    A: {
        label: '高予算層',
        description: 'プレミアム枠・PR枠・Job Flair等の有料オプション使用',
    },
    B: {
        label: '中予算層',
        description: '1ページ目表示(上位30〜100件)',
    },
    C: {
        label: '低予算層',
        description: '2ページ目以降または下位表示',
    }
} as const;

// Rank badge config
export const rankConfig: Record<BudgetRank, { label: string; className: string }> = {
    A: { label: 'A', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 font-bold' },
    B: { label: 'B', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-bold' },
    C: { label: 'C', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-bold' },
};

// Sort types
export type SortColumn = 'industry' | 'area' | 'salary' | 'employees' | 'source' | 'jobPageUpdated' | 'lastFetched' | 'status' | 'jobType' | null;
export type SortDirection = 'asc' | 'desc';

// Filter tab options
export type FilterTab = '勤務地' | '職種';

// Region checkbox options
export const regionCheckboxOptions = [
    '北海道', '東北', '関東', '甲信越', '北陸',
    '東海', '関西', '中国', '四国', '九州・沖縄'
];

// Job type checkbox options
export const jobTypeCheckboxOptions = [
    '営業・販売',
    '経営・事業企画・人事・事務',
    'IT・Web・ゲームエンジニア',
    'モノづくりエンジニア',
    'コンサルタント・士業・金融',
    'サービス・販売・接客',
    '不動産・建設',
    '物流・運輸・運転',
    'その他'
];

// Map prefectures to regions
export const prefectureToRegion: Record<string, string> = {
    '北海道': '北海道',
    '青森県': '東北', '岩手県': '東北', '宮城県': '東北', '秋田県': '東北', '山形県': '東北', '福島県': '東北',
    '茨城県': '関東', '栃木県': '関東', '群馬県': '関東', '埼玉県': '関東', '千葉県': '関東', '東京都': '関東', '神奈川県': '関東',
    '新潟県': '甲信越', '山梨県': '甲信越', '長野県': '甲信越',
    '富山県': '北陸', '石川県': '北陸', '福井県': '北陸',
    '岐阜県': '東海', '静岡県': '東海', '愛知県': '東海', '三重県': '東海',
    '滋賀県': '関西', '京都府': '関西', '大阪府': '関西', '兵庫県': '関西', '奈良県': '関西', '和歌山県': '関西',
    '鳥取県': '中国', '島根県': '中国', '岡山県': '中国', '広島県': '中国', '山口県': '中国',
    '徳島県': '四国', '香川県': '四国', '愛媛県': '四国', '高知県': '四国',
    '福岡県': '九州・沖縄', '佐賀県': '九州・沖縄', '長崎県': '九州・沖縄', '熊本県': '九州・沖縄',
    '大分県': '九州・沖縄', '宮崎県': '九州・沖縄', '鹿児島県': '九州・沖縄', '沖縄県': '九州・沖縄',
};

// Source badge config
export const sourceConfig: Record<string, { label: string; className: string }> = {
    mynavi: { label: 'マイナビ', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300' },
    rikunabi: { label: 'リクナビ', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
    doda: { label: 'doda', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
};

// Status options
export const statusOptions = [
    { value: 'all', label: 'すべて' },
    { value: 'pending', label: '未対応' },
    { value: 'contacted', label: '連絡済み' },
    { value: 'interested', label: '興味あり' },
    { value: 'rejected', label: '対象外' },
];

// Per page options
export const perPageOptions = [25, 50, 100, 200];

// Default per page
export const DEFAULT_PER_PAGE = 50;
