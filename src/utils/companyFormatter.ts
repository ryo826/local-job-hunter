/**
 * 企業データの整形ユーティリティ
 * 長いテキストから必要な情報のみを抽出し、1行表示に適した形式に変換
 */

import type { Company } from '../types';

export interface FormattedCompany {
    // 表示用（短縮版）
    companyName: string;
    industry: string;
    salary: string;
    scale: string;
    area: string;

    // 詳細用（元データ）
    fullCompanyName: string;
    fullIndustry: string;
    fullSalary: string;
    fullScale: string;
    establishment: string;
    representative: string;
    revenue: string;
}

/**
 * 会社名から装飾文字を除去
 * 例: "◆東証上場企業◆ 株式会社サンプル【年収500万円以上】" → "株式会社サンプル"
 */
export function formatCompanyName(name: string | null): string {
    if (!name) return '-';

    return name
        // 装飾記号を削除
        .replace(/[◆◇★☆●○■□▲△▼▽◎※♪♡❤]/g, '')
        // 【】内の文字を削除
        .replace(/【[^】]*】/g, '')
        // 〈〉内の文字を削除
        .replace(/〈[^〉]*〉/g, '')
        // ＜＞内の文字を削除
        .replace(/＜[^＞]*＞/g, '')
        // <>内の文字を削除
        .replace(/<[^>]*>/g, '')
        // 「」内の補足を削除（会社名の後に続く場合）
        .replace(/「[^」]*」/g, '')
        // │や|で区切られた後の説明を削除
        .replace(/[│|｜].*/g, '')
        // 複数スペースを1つに
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 業種から主要事業名のみを抽出
 * 例: "システム開発事業、ITコンサルティング事業を展開。..." → "システム開発事業、ITコンサルティング"
 */
export function formatIndustry(industry: string | null): string {
    if (!industry) return '-';

    // 「〜事業」のパターンを抽出
    const businessPatterns = industry.match(/[^\s、。]+事業/g);
    if (businessPatterns && businessPatterns.length > 0) {
        return businessPatterns.slice(0, 3).join('、');
    }

    // 事業がない場合、最初の句点または読点までを取得
    const firstSentence = industry.split(/[。、]/)[0];
    return firstSentence.length > 30 ? firstSentence.substring(0, 30) + '...' : firstSentence;
}

/**
 * 給与情報から月給/年収のみを抽出
 * 例: "月給25万円以上＋インセンティブ（年2回）+各種手当..." → "月給25万円以上"
 */
export function formatSalary(salary: string | null): string {
    if (!salary) return '-';

    // 月給パターン
    const monthlyMatch = salary.match(/月給\s*[\d,.]+\s*万円[以上]*/);
    if (monthlyMatch) return monthlyMatch[0].replace(/\s/g, '');

    // 年収パターン
    const annualMatch = salary.match(/年収\s*[\d,.]+\s*[万~～〜]+[\d,.]*\s*万円/);
    if (annualMatch) return annualMatch[0].replace(/\s/g, '');

    // 年収（単一値）パターン
    const annualSingleMatch = salary.match(/年収\s*[\d,.]+\s*万円[以上]*/);
    if (annualSingleMatch) return annualSingleMatch[0].replace(/\s/g, '');

    // 見つからない場合、最初の数字を含む部分を返す
    const firstNumber = salary.match(/[\d,.]+\s*万円/);
    return firstNumber ? firstNumber[0] : salary.substring(0, 20) + (salary.length > 20 ? '...' : '');
}

/**
 * 従業員数のみを抽出
 * 例: "連結：5,000名 単体：3,000名（2023年4月時点）売上高100億円" → "連結：5,000名"
 */
export function formatScale(employees: string | null, revenue: string | null): string {
    if (!employees && !revenue) return '-';

    if (employees) {
        // 連結従業員数
        const consolidatedMatch = employees.match(/連結[：:]\s*[\d,]+\s*名/);
        if (consolidatedMatch) return consolidatedMatch[0];

        // 単体従業員数
        const standaloneMatch = employees.match(/単体[：:]\s*[\d,]+\s*名/);
        if (standaloneMatch) return standaloneMatch[0];

        // 単純な従業員数
        const simpleMatch = employees.match(/[\d,]+\s*名/);
        if (simpleMatch) return simpleMatch[0];

        // 「人」表記
        const personMatch = employees.match(/[\d,]+\s*人/);
        if (personMatch) return personMatch[0].replace('人', '名');
    }

    return employees?.substring(0, 20) || '-';
}

/**
 * 住所から都道府県・市区町村のみを抽出
 * 例: "東京都渋谷区恵比寿1-2-3 サンプルビル5F" → "東京都渋谷区"
 */
export function formatArea(address: string | null, area: string | null): string {
    if (area) return area;
    if (!address) return '-';

    // 都道府県と市区町村を抽出
    const match = address.match(/^(.+?[都道府県])(.+?[市区町村])?/);
    if (match) {
        return match[2] ? `${match[1]}${match[2]}` : match[1];
    }

    return address.substring(0, 15) + (address.length > 15 ? '...' : '');
}

/**
 * Company型から整形済みデータを生成
 */
export function formatCompanyData(company: Company): FormattedCompany {
    return {
        // 表示用（短縮版）
        companyName: formatCompanyName(company.company_name),
        industry: formatIndustry(company.industry),
        salary: formatSalary(company.salary_text),
        scale: formatScale(company.employees, company.revenue),
        area: formatArea(company.address, company.area),

        // 詳細用（元データ）
        fullCompanyName: company.company_name || '-',
        fullIndustry: company.industry || '-',
        fullSalary: company.salary_text || '-',
        fullScale: company.employees || '-',
        establishment: company.establishment || '-',
        representative: company.representative || '-',
        revenue: company.revenue || '-',
    };
}
