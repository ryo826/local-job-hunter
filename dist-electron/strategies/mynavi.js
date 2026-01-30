"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MynaviStrategy = void 0;
class MynaviStrategy {
    source = 'mynavi';
    async *scrape(page, params) {
        const { keywords, location } = params;
        // 1. Construct Search URL
        let searchUrl = 'https://tenshoku.mynavi.jp/list/';
        const queryParams = [];
        if (keywords)
            queryParams.push(`kw${encodeURIComponent(keywords)}`);
        // Area map needs to be implemented strictly, simple append for now
        if (location && location !== 'none')
            queryParams.push(`jobsearchCityCode${this.getAreaCode(location)}`);
        if (queryParams.length > 0) {
            searchUrl += `?${queryParams.join('&')}`;
        }
        console.log(`[Mynavi] Searching: ${searchUrl}`);
        await page.goto(searchUrl);
        let hasNext = true;
        while (hasNext) {
            // Get all detail URLs on the current page
            // .cassetteRecruit__copy a is usually the main link
            const links = await page.locator('.cassetteRecruit .cassetteRecruit__copy a').all();
            const urls = [];
            for (const link of links) {
                const href = await link.getAttribute('href');
                if (href) {
                    // Mynavi links can be relative or absolute. Usually starts with /job/
                    const fullUrl = href.startsWith('http') ? href : `https://tenshoku.mynavi.jp${href}`;
                    // Clean URL (remove query params for uniqueness if needed, but some ids are in query)
                    // Mynavi usually: https://tenshoku.mynavi.jp/job/12345/
                    urls.push(fullUrl.split('?')[0]);
                }
            }
            console.log(`[Mynavi] Found ${urls.length} jobs on page. Visiting details...`);
            // Deep Crawl: Visit each detail page
            for (const url of urls) {
                try {
                    await page.goto(url);
                    await page.waitForTimeout(2000); // Sleep 2s Safety
                    // Extract Basic Info from Job Page
                    const companyName = await this.extractText(page, '.companyName') ||
                        await this.extractText(page, 'h3.heading'); // Fallback
                    // --- Extract Job Info ---
                    const jobTitle = await this.extractText(page, '.jobTitle') || '募集職種不明';
                    // Looking for Salary in table (Typical pattern: th with "給与" -> td)
                    const salaryText = await page.locator('th:has-text("給与") + td').first().innerText().catch(() => '');
                    // --- Visit Company Overview Tab ---
                    // Mynavi has tabs like "求人情報", "企業情報"
                    // Need to click "企業情報" tab if not visible
                    const companyTab = page.locator('li a:has-text("企業情報")');
                    if (await companyTab.count() > 0) {
                        await companyTab.click();
                        await page.waitForTimeout(1000);
                    }
                    // --- Extract Company Details ---
                    const representative = await this.extractTableValue(page, '代表者');
                    const establishment = await this.extractTableValue(page, '設立');
                    const employees = await this.extractTableValue(page, '従業員数');
                    const revenue = await this.extractTableValue(page, '売上高');
                    const phone = await this.extractTableValue(page, '電話番号') || await this.extractTableValue(page, '連絡先');
                    const address = await this.extractTableValue(page, '本社所在地') || await this.extractTableValue(page, '事業所');
                    const homepageUrl = await page.locator('a:has-text("ホームページ")').getAttribute('href').catch(() => undefined) || undefined;
                    // Split Address to Area
                    const area = address ? this.parseArea(address) : undefined;
                    // Clean Company Name
                    const cleanName = this.cleanCompanyName(companyName || '名称不明');
                    const data = {
                        source: this.source,
                        url,
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: salaryText,
                        representative,
                        establishment,
                        employees,
                        revenue,
                        phone,
                        contact_form_url: undefined, // Mynavi usually doesn't expose direct form
                        address,
                        homepage_url: homepageUrl || undefined,
                        area,
                        industry: undefined // Could extract from table if available
                    };
                    yield data;
                }
                catch (e) {
                    console.error(`[Mynavi] Failed to process ${url}`, e);
                }
            }
            // Pagination
            const nextButton = page.locator('a.iconFont--arrowLeft:has-text("次へ")');
            if (await nextButton.count() > 0 && await nextButton.isVisible()) {
                await nextButton.click();
                await page.waitForTimeout(2000);
            }
            else {
                hasNext = false;
            }
        }
    }
    async extractText(page, selector) {
        try {
            return (await page.locator(selector).first().innerText()).trim();
        }
        catch {
            return undefined;
        }
    }
    async extractTableValue(page, headerText) {
        try {
            // Try standard table structure
            const target = page.locator(`th:has-text("${headerText}") + td`);
            if (await target.count() > 0)
                return (await target.first().innerText()).trim();
            // Try dl/dt/dd structure
            const dtTarget = page.locator(`dt:has-text("${headerText}") + dd`);
            if (await dtTarget.count() > 0)
                return (await dtTarget.first().innerText()).trim();
            return undefined;
        }
        catch {
            return undefined;
        }
    }
    parseArea(address) {
        const match = address.match(/(.+?[都道府県])/);
        return match ? match[1] : (address.substring(0, 3)); // Fallback to first 3 chars
    }
    cleanCompanyName(name) {
        return name
            .replace(/株式会社|有限会社|合同会社|一般社団法人/g, '')
            .replace(/[【\(（].*?[）\)】]/g, '') // Remove brackets like 【急募】
            .trim();
    }
    getAreaCode(location) {
        // Simplified mapping, real app needs full map
        const map = {
            '東京': '13', '神奈川': '14', '大阪': '27', '愛知': '23',
            '福岡': '40', '北海道': '01'
        };
        return map[location] || '';
    }
}
exports.MynaviStrategy = MynaviStrategy;
