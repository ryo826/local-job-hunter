import { Job, Location } from '../../src/shared/types/Job';
import { CompanyData } from '../strategies/ScrapingStrategy';

export class DataConverter {
    /**
     * CompanyDataからJobオブジェクトに変換
     */
    static companyDataToJob(companyData: CompanyData): Job {
        const now = new Date().toISOString();

        // Job IDを生成 (source_jobId形式)
        const jobId = this.generateJobId(companyData);

        // 給与情報を正規化
        const salary = this.normalizeSalary(companyData.salary_text || '');

        // 勤務地情報を構造化
        const locations = this.parseLocations(companyData.address, companyData.area);

        return {
            id: jobId,
            source: companyData.source as 'mynavi' | 'doda' | 'rikunabi',
            sourceJobId: this.extractJobId(companyData.url, companyData.source),
            sourceUrl: companyData.url,

            companyName: companyData.company_name,
            companyUrl: companyData.homepage_url,
            companyLogo: undefined,

            title: companyData.job_title || 'タイトル不明',
            employmentType: '正社員', // デフォルト
            industry: companyData.industry,

            description: companyData.job_description || '',
            requirements: undefined,
            benefits: undefined,
            workHours: undefined,

            salaryMin: salary.min,
            salaryMax: salary.max,
            salaryText: companyData.salary_text || '',

            locations,
            locationSummary: companyData.address || companyData.area || '',

            labels: [],
            keywords: [],

            datePosted: now,
            dateExpires: undefined,
            dateUpdated: now,

            scrapedAt: now,
            lastCheckedAt: now,
            isActive: true,

            ngKeywordMatches: []
        };
    }

    /**
     * Job IDを生成
     */
    private static generateJobId(companyData: CompanyData): string {
        const source = companyData.source;
        const jobId = this.extractJobId(companyData.url, source);
        return `${source}_${jobId}`;
    }

    /**
     * URLからJob IDを抽出
     */
    private static extractJobId(url: string, source: string): string {
        switch (source) {
            case 'mynavi':
                // https://tenshoku.mynavi.jp/jobinfo-99359-1-160-1/
                const mynaviMatch = url.match(/\/jobinfo-([^\/]+)\//);
                return mynaviMatch ? mynaviMatch[1] : this.hashUrl(url);

            case 'doda':
                // https://doda.jp/DodaFront/View/JobSearchDetail/j_jid__3014345383/
                const dodaMatch = url.match(/j_jid__(\d+)/);
                return dodaMatch ? dodaMatch[1] : this.hashUrl(url);

            case 'rikunabi':
                // https://next.rikunabi.com/company/cmi1234567/
                const rikunabiMatch = url.match(/\/company\/([^\/]+)\//);
                return rikunabiMatch ? rikunabiMatch[1] : this.hashUrl(url);

            default:
                return this.hashUrl(url);
        }
    }

    /**
     * URLをハッシュ化してIDを生成
     */
    private static hashUrl(url: string): string {
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * 給与情報を正規化
     */
    private static normalizeSalary(salaryText: string): { min?: number; max?: number } {
        if (!salaryText) return {};

        // 年収パターン: "年収400万円～600万円"
        const yearMatch = salaryText.match(/年収(\d+)万円～(\d+)万円/);
        if (yearMatch) {
            return {
                min: parseInt(yearMatch[1]) * 10000,
                max: parseInt(yearMatch[2]) * 10000
            };
        }

        // 年収単一値: "年収500万円"
        const yearSingleMatch = salaryText.match(/年収(\d+)万円/);
        if (yearSingleMatch) {
            const value = parseInt(yearSingleMatch[1]) * 10000;
            return { min: value, max: value };
        }

        // 月給パターン: "月給25万円～35万円"
        const monthMatch = salaryText.match(/月給(\d+)万円～(\d+)万円/);
        if (monthMatch) {
            return {
                min: parseInt(monthMatch[1]) * 10000 * 12,
                max: parseInt(monthMatch[2]) * 10000 * 12
            };
        }

        // 月給単一値: "月給30万円"
        const monthSingleMatch = salaryText.match(/月給(\d+)万円/);
        if (monthSingleMatch) {
            const monthly = parseInt(monthSingleMatch[1]) * 10000;
            return { min: monthly * 12, max: monthly * 12 };
        }

        // 時給パターン: "時給1,500円～2,000円"
        const hourMatch = salaryText.match(/時給(\d+(?:,\d+)?)円～(\d+(?:,\d+)?)円/);
        if (hourMatch) {
            const hourMin = parseInt(hourMatch[1].replace(',', ''));
            const hourMax = parseInt(hourMatch[2].replace(',', ''));
            return {
                min: hourMin * 8 * 20 * 12, // 年収換算（8h×20日×12ヶ月）
                max: hourMax * 8 * 20 * 12
            };
        }

        return {};
    }

    /**
     * 勤務地情報を構造化
     */
    private static parseLocations(address?: string, area?: string): Location[] {
        const locationText = address || area || '';
        if (!locationText) return [];

        const locations: Location[] = [];

        // 都道府県リスト
        const prefectures = [
            '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
            '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
            '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
            '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
            '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
            '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
            '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
        ];

        // 都道府県を検出
        for (const pref of prefectures) {
            if (locationText.includes(pref)) {
                // 市区町村を抽出
                const afterPref = locationText.substring(locationText.indexOf(pref) + pref.length);
                const localityMatch = afterPref.match(/^([^、,\s]+)/);
                const locality = localityMatch ? localityMatch[1] : undefined;

                locations.push({
                    region: pref,
                    locality,
                    address: locationText
                });
                break; // 最初の都道府県のみ
            }
        }

        // 都道府県が見つからない場合
        if (locations.length === 0) {
            locations.push({ address: locationText });
        }

        return locations;
    }
}
