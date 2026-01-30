// scrapers/mynavi/MynaviParser.ts
import { Job, Location } from '../../../src/shared/types/Job';

export class MynaviParser {
    parseJsonLd(jobId: string, jsonLd: any, html: string): Job {
        return {
            // 統合ID
            id: `mynavi_${jobId}`,
            source: 'mynavi',
            sourceJobId: jobId,
            sourceUrl: jsonLd.url || `https://tenshoku.mynavi.jp/jobinfo-${jobId}/`,

            // 企業情報
            companyName: jsonLd.hiringOrganization?.name || 'Unknown',
            companyUrl: jsonLd.hiringOrganization?.sameAs,
            companyLogo: jsonLd.hiringOrganization?.logo,

            // 求人基本情報
            title: jsonLd.title || 'Untitled',
            employmentType: this.normalizeEmploymentType(jsonLd.employmentType),
            industry: jsonLd.industry,

            // 詳細情報
            description: this.cleanHtml(jsonLd.description),
            requirements: this.cleanHtml(jsonLd.experienceRequirements),
            benefits: this.cleanHtml(jsonLd.jobBenefits),
            workHours: this.cleanHtml(jsonLd.workHours),

            // 給与情報
            salaryMin: this.parseSalaryValue(jsonLd.baseSalary?.value?.minValue),
            salaryMax: this.parseSalaryValue(jsonLd.baseSalary?.value?.maxValue),
            salaryText: this.extractSalaryText(html),

            // 勤務地情報
            locations: this.parseLocations(jsonLd.jobLocation),
            locationSummary: this.summarizeLocations(jsonLd.jobLocation),

            // ラベル・タグ（HTMLから抽出）
            labels: this.extractLabels(html),
            keywords: this.extractKeywords(html),

            // 日付情報
            datePosted: jsonLd.datePosted ? new Date(jsonLd.datePosted).toISOString() : new Date().toISOString(),
            dateExpires: jsonLd.validThrough ? new Date(jsonLd.validThrough).toISOString() : undefined,
            dateUpdated: new Date().toISOString(),

            // スクレイピング管理
            scrapedAt: new Date().toISOString(),
            lastCheckedAt: new Date().toISOString(),
            isActive: true,
            ngKeywordMatches: []
        };
    }

    private normalizeEmploymentType(type: string): string {
        const mapping: Record<string, string> = {
            'FULL_TIME': '正社員',
            'PART_TIME': 'アルバイト・パート',
            'CONTRACT': '契約社員',
            'TEMPORARY': '派遣社員'
        };
        return mapping[type] || type || '正社員';
    }

    private parseSalaryValue(value: any): number | undefined {
        if (!value) return undefined;
        const num = parseInt(value);
        return isNaN(num) ? undefined : num;
    }

    private parseLocations(jobLocation: any): Location[] {
        if (!jobLocation) return [];

        const locations = Array.isArray(jobLocation) ? jobLocation : [jobLocation];

        return locations.map(loc => ({
            region: loc?.address?.addressRegion,
            locality: loc?.address?.addressLocality,
            address: loc?.address?.streetAddress
        })).filter(loc => loc.region || loc.locality || loc.address);
    }

    private summarizeLocations(jobLocation: any): string {
        const locs = this.parseLocations(jobLocation);
        if (locs.length === 0) return '';

        return locs.map(loc =>
            [loc.region, loc.locality].filter(Boolean).join(' ')
        ).join(', ');
    }

    private cleanHtml(html: string | undefined): string {
        if (!html) return '';
        // HTMLタグを除去して改行を正規化
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&nbsp;/g, ' ')
            .trim();
    }

    private extractSalaryText(html: string): string {
        // HTMLから給与テキストを抽出
        const match = html.match(/<th[^>]*>給与<\/th>\s*<td[^>]*>([^<]+)<\/td>/);
        if (match) return match[1].trim();

        // 別のパターンを試す
        const match2 = html.match(/給与[：:]\s*([^\n<]+)/);
        return match2 ? match2[1].trim() : '';
    }

    private extractLabels(html: string): string[] {
        // <ul class="label_list">から抽出
        const matches = html.matchAll(/<ul[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi);
        const labels: string[] = [];

        for (const match of matches) {
            const liMatches = match[1].matchAll(/<li[^>]*>([^<]+)<\/li>/g);
            for (const li of liMatches) {
                const label = li[1].trim();
                if (label) labels.push(label);
            }
        }

        return [...new Set(labels)]; // 重複除去
    }

    private extractKeywords(html: string): string[] {
        // <div class="keyword">から抽出
        const match = html.match(/<div[^>]*class="[^"]*keyword[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (!match) return [];

        const linkMatches = match[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g);
        const keywords: string[] = [];

        for (const link of linkMatches) {
            const keyword = link[1].trim();
            if (keyword) keywords.push(keyword);
        }

        return [...new Set(keywords)]; // 重複除去
    }
}
