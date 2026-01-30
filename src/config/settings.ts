/**
 * NGワード設定
 * これらのワードを含む企業は赤背景で警告表示されます
 */
export const ngWords: string[] = [
    '派遣',
    'ブラック',
    '詐欺',
    'マルチ',
    'ネットワークビジネス',
    // 必要に応じて追加
];

/**
 * ステータス一覧
 */
export const statusOptions = [
    { value: 'new', label: '新規', color: 'blue' },
    { value: 'contacted', label: '連絡済み', color: 'yellow' },
    { value: 'responded', label: '返信あり', color: 'green' },
    { value: 'meeting', label: '商談中', color: 'purple' },
    { value: 'won', label: '成約', color: 'emerald' },
    { value: 'lost', label: '失注', color: 'gray' },
    { value: 'ng', label: 'NG', color: 'red' },
] as const;

/**
 * スクレイピングソース一覧
 */
export const sourceOptions = [
    { value: 'mynavi', label: 'マイナビ転職' },
    { value: 'rikunabi', label: 'リクナビNEXT' },
    { value: 'doda', label: 'doda' },
] as const;
