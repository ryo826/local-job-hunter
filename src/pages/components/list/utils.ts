// 求人ページ更新日のフォーマットと鮮度判定
export function formatJobPageUpdated(dateStr: string | null): { text: string; daysAgo: number; className: string } {
    if (!dateStr) {
        return { text: '-', daysAgo: -1, className: 'text-muted-foreground' };
    }

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // 日付フォーマット: M/D
    const formatted = `${date.getMonth() + 1}/${date.getDate()}`;
    let className: string;

    if (daysAgo <= 3) {
        className = 'text-green-600 dark:text-green-400';  // 最新
    } else if (daysAgo <= 7) {
        className = 'text-blue-600 dark:text-blue-400';    // 比較的新しい
    } else if (daysAgo <= 14) {
        className = 'text-yellow-600 dark:text-yellow-400'; // やや古い
    } else {
        className = 'text-red-600 dark:text-red-400';      // 古い
    }

    return { text: `${formatted} (${daysAgo}日前)`, daysAgo, className };
}

// 最終取得日のフォーマットと鮮度判定
export function formatLastFetched(dateStr: string | null): { text: string; daysAgo: number; className: string } {
    if (!dateStr) {
        return { text: '-', daysAgo: -1, className: 'text-muted-foreground' };
    }

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let text: string;
    let className: string;

    if (daysAgo === 0) {
        text = '今日';
        className = 'text-green-600 dark:text-green-400';
    } else if (daysAgo === 1) {
        text = '昨日';
        className = 'text-green-600 dark:text-green-400';
    } else if (daysAgo <= 3) {
        text = `${daysAgo}日前`;
        className = 'text-blue-600 dark:text-blue-400';
    } else if (daysAgo <= 7) {
        text = `${daysAgo}日前`;
        className = 'text-yellow-600 dark:text-yellow-400';
    } else if (daysAgo <= 30) {
        text = `${daysAgo}日前`;
        className = 'text-orange-600 dark:text-orange-400';
    } else {
        text = `${daysAgo}日前`;
        className = 'text-red-600 dark:text-red-400';
    }

    return { text, daysAgo, className };
}

// Parse salary to number for comparison
export function parseSalary(salaryText: string | null): number {
    if (!salaryText) return 0;
    const match = salaryText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// Parse employees to number for comparison
export function parseEmployees(employeesText: string | null): number {
    if (!employeesText) return 0;
    const match = employeesText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}
