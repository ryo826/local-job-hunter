import { dialog } from 'electron';
import * as fs from 'fs';
import { SupabaseCompanyRepository } from '../repositories/SupabaseCompanyRepository';

const companyRepository = new SupabaseCompanyRepository();

export interface ExportOptions {
    ids?: number[];
    filters?: {
        status?: string;
        search?: string;
    };
}

export class ExportService {
    /**
     * Export companies to CSV with BOM for Excel compatibility
     */
    async exportToCSV(options: ExportOptions = {}): Promise<{ success: boolean; error?: string; path?: string }> {
        try {
            // Get companies based on options
            let companies;
            if (options.ids && options.ids.length > 0) {
                // Export selected companies
                const results = await Promise.all(
                    options.ids.map(id => companyRepository.getById(id))
                );
                companies = results.filter(c => c !== null);
            } else {
                // Export all companies (with filters if provided)
                companies = await companyRepository.getAll(options.filters || {});
            }

            if (companies.length === 0) {
                return { success: false, error: 'エクスポートするデータがありません' };
            }

            // Define CSV columns
            const headers = [
                '会社名',
                '職種',
                '電話番号',
                'メールアドレス',
                '住所',
                'URL',
                '業種',
                'エリア',
                '給与',
                '代表者',
                '設立',
                '従業員数',
                'ステータス',
                'ソース',
                '企業HP',
                '問い合わせURL'
            ];

            // Build CSV rows
            const rows = companies.map(company => [
                this.escapeCsvField(company.company_name || ''),
                this.escapeCsvField(company.job_title || ''),
                this.escapeCsvField(company.phone || ''),
                this.escapeCsvField(company.email || ''),
                this.escapeCsvField(company.address || ''),
                this.escapeCsvField(company.url || ''),
                this.escapeCsvField(company.industry || ''),
                this.escapeCsvField(company.area || ''),
                this.escapeCsvField(company.salary_text || ''),
                this.escapeCsvField(company.representative || ''),
                this.escapeCsvField(company.establishment || ''),
                this.escapeCsvField(company.employees || ''),
                this.escapeCsvField(company.status || ''),
                this.escapeCsvField(company.source || ''),
                this.escapeCsvField(company.homepage_url || ''),
                this.escapeCsvField(company.contact_form_url || '')
            ]);

            // Create CSV content with BOM for UTF-8 Excel compatibility
            const BOM = '\uFEFF';
            const csvContent = BOM + [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\r\n');

            // Show save dialog
            const result = await dialog.showSaveDialog({
                title: '企業リストをエクスポート',
                defaultPath: `companies_${this.getDateString()}.csv`,
                filters: [
                    { name: 'CSV Files', extensions: ['csv'] }
                ]
            });

            if (result.canceled || !result.filePath) {
                return { success: false, error: 'キャンセルされました' };
            }

            // Write file
            fs.writeFileSync(result.filePath, csvContent, 'utf-8');

            return { success: true, path: result.filePath };
        } catch (error) {
            console.error('[ExportService] Error:', error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * Escape CSV field (handle commas, quotes, newlines)
     */
    private escapeCsvField(value: string): string {
        if (!value) return '';

        // If field contains comma, quote, or newline, wrap in quotes
        if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
            // Escape quotes by doubling them
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    /**
     * Get formatted date string for filename
     */
    private getDateString(): string {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    }
}

// Singleton instance
let instance: ExportService | null = null;

export function getExportService(): ExportService {
    if (!instance) {
        instance = new ExportService();
    }
    return instance;
}
