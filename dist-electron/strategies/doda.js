"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DodaStrategy = void 0;
class DodaStrategy {
    source = 'doda';
    async *scrape(page, params) {
        const { keywords, location } = params;
        // Use the correct URL format with L suffix
        let searchUrl = 'https://doda.jp/DodaFront/View/JobSearchList/j_oc__03L/'; // Engineers
        if (keywords) {
            searchUrl = `https://doda.jp/DodaFront/View/JobSearchList.action?kw=${encodeURIComponent(keywords)}`;
        }
        console.log(`[Doda] Searching: ${searchUrl}`);
        await page.goto(searchUrl);
        await page.waitForTimeout(3000);
        let hasNext = true;
        let pageNum = 0;
        while (hasNext && pageNum < 10) { // Max 10 pages
            console.log(`[Doda] Scraping page ${pageNum + 1}...`);
            // NEW: Use article or .jobCard-card selectors
            const jobArticles = await page.locator('article, .jobCard-card').all();
            console.log(`[Doda] Found ${jobArticles.length} job articles`);
            for (const article of jobArticles) {
                try {
                    // Extract from article
                    const linkEl = article.locator('.jobCard-header__link, a.headerLink').first();
                    const url = await linkEl.getAttribute('href');
                    if (!url)
                        continue;
                    const fullUrl = url.startsWith('http') ? url : `https://doda.jp${url}`;
                    // Company name from h2
                    const companyNameEl = linkEl.locator('h2').first();
                    let companyName = await companyNameEl.textContent() || '';
                    // Job title from p in the header
                    const jobTitleEl = linkEl.locator('p').first();
                    const jobTitle = await jobTitleEl.textContent() || '';
                    // Extract area and salary from .jobCard-info
                    let area = '';
                    let salaryText = '';
                    const infoItems = await article.locator('.jobCard-info dt').all();
                    for (const dt of infoItems) {
                        const labelText = await dt.textContent() || '';
                        const dd = dt.locator('~ dd').first();
                        const valueText = await dd.textContent() || '';
                        if (labelText.includes('勤務地')) {
                            area = valueText.trim();
                        }
                        else if (labelText.includes('給与')) {
                            salaryText = valueText.trim();
                        }
                    }
                    // Visit detail page
                    console.log(`[Doda] Visiting: ${fullUrl}`);
                    await page.goto(fullUrl);
                    await page.waitForTimeout(2000);
                    // Try to click company overview tab
                    const companyTab = page.locator('a:has-text("会社概要"), a[href*="company"]').first();
                    if (await companyTab.count() > 0) {
                        await companyTab.click();
                        await page.waitForTimeout(1500);
                    }
                    // Extract additional details
                    const representative = await this.extractTableValue(page, '代表者');
                    const establishment = await this.extractTableValue(page, '設立');
                    const employees = await this.extractTableValue(page, '従業員数');
                    const revenue = await this.extractTableValue(page, '売上高');
                    const address = await this.extractTableValue(page, '所在地') || await this.extractTableValue(page, '本社所在地');
                    const homepageUrl = await this.extractTableValue(page, 'ホームページ') || await this.extractTableValue(page, 'URL');
                    const phone = await this.extractTableValue(page, '電話番号');
                    const industry = await this.extractTableValue(page, '業種') || await this.extractTableValue(page, '事業内容');
                    // Clean company name
                    const cleanName = this.cleanCompanyName(companyName);
                    yield {
                        source: this.source,
                        url: fullUrl,
                        company_name: cleanName,
                        job_title: jobTitle,
                        salary_text: salaryText,
                        representative,
                        establishment,
                        employees,
                        revenue,
                        phone,
                        address,
                        area: area || this.extractAreaFromAddress(address),
                        homepage_url: homepageUrl,
                        industry,
                    };
                    // Go back to list
                    await page.goBack();
                    await page.waitForTimeout(1500);
                }
                catch (err) {
                    console.error(`[Doda] Error scraping job:`, err);
                    // Try to go back to list
                    try {
                        await page.goBack();
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // If goBack fails, reload the search page
                        await page.goto(searchUrl);
                        await page.waitForTimeout(2000);
                    }
                    continue;
                }
            }
            // Check for next page
            pageNum++;
            const nextButton = page.locator('a.next, button:has-text("次へ"), a:has-text("次へ")').first();
            if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
                await nextButton.click();
                await page.waitForTimeout(3000);
            }
            else {
                hasNext = false;
            }
        }
    }
    cleanCompanyName(name) {
        return name
            .replace(/【.*?】/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/（.*?）/g, '')
            .replace(/株式会社|有限会社|合同会社|一般社団法人|公益財団法人/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    extractAreaFromAddress(address) {
        if (!address)
            return '';
        const match = address.match(/([東京大阪京都神奈川埼玉千葉愛知北海道福岡].*?[都道府県市区町村])/);
        return match ? match[1] : '';
    }
    async extractText(page, selector) {
        const el = page.locator(selector).first();
        if (await el.count() > 0) {
            return (await el.textContent())?.trim() || undefined;
        }
        return undefined;
    }
    async extractTableValue(page, label) {
        // Look for dt/dd, th/td patterns
        const dtEl = page.locator(`dt:has-text("${label}"), th:has-text("${label}")`).first();
        if (await dtEl.count() > 0) {
            const ddEl = dtEl.locator('~ dd, ~ td').first();
            if (await ddEl.count() > 0) {
                return (await ddEl.textContent())?.trim() || undefined;
            }
        }
        return undefined;
    }
}
exports.DodaStrategy = DodaStrategy;
