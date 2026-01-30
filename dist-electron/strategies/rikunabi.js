"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RikunabiStrategy = void 0;
class RikunabiStrategy {
    source = 'rikunabi';
    async *scrape(page, params) {
        const { keywords, location } = params;
        // Start from homepage and search
        let searchUrl = 'https://next.rikunabi.com/';
        console.log(`[Rikunabi] Starting from: ${searchUrl}`);
        await page.goto(searchUrl);
        await page.waitForTimeout(2000);
        // Perform search if keywords provided
        if (keywords) {
            const searchInput = page.locator('input[name="kwd"], input[type="search"]').first();
            if (await searchInput.count() > 0) {
                await searchInput.fill(keywords);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(3000);
            }
        }
        else {
            // Navigate to job list
            const areaLink = page.locator('a[href*="/job_search/"]').first();
            if (await areaLink.count() > 0) {
                await areaLink.click();
                await page.waitForTimeout(3000);
            }
        }
        let hasNext = true;
        let pageNum = 0;
        while (hasNext && pageNum < 10) { // Max 10 pages
            console.log(`[Rikunabi] Scraping page ${pageNum + 1}...`);
            // NEW: Use CSS Module-compatible selectors
            const jobCards = await page.locator('a[class*="bigCard"]').all();
            console.log(`[Rikunabi] Found ${jobCards.length} job cards`);
            for (const card of jobCards) {
                try {
                    // Extract from list page
                    const url = await card.getAttribute('href');
                    if (!url)
                        continue;
                    const fullUrl = url.startsWith('http') ? url : `https://next.rikunabi.com${url}`;
                    // Company name from employerNameBase
                    const companyNameEl = card.locator('span[class*="employerNameBase"]').first();
                    let companyName = await companyNameEl.textContent() || '';
                    // Job title from h2
                    const jobTitleEl = card.locator('h2').first();
                    const jobTitle = await jobTitleEl.textContent() || '';
                    // Extract area and salary from cardInfoText paragraphs
                    const infoParagraphs = await card.locator('p[class*="cardInfoText"]').all();
                    let area = '';
                    let salaryText = '';
                    for (const p of infoParagraphs) {
                        const text = await p.textContent() || '';
                        if (text.includes('県') || text.includes('都') || text.includes('府') || text.includes('〒')) {
                            area = text.trim();
                        }
                        else if (text.includes('万円') || text.includes('月給') || text.includes('年収')) {
                            salaryText = text.trim();
                        }
                    }
                    // Visit detail page for more info
                    console.log(`[Rikunabi] Visiting: ${fullUrl}`);
                    await page.goto(fullUrl);
                    await page.waitForTimeout(2000);
                    // Try to find company overview tab
                    const companyTab = page.locator('a:has-text("会社概要"), a[class*="companyInfo"]').first();
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
                    console.error(`[Rikunabi] Error scraping job:`, err);
                    continue;
                }
            }
            // Check for next page
            pageNum++;
            const nextButton = page.locator('a[class*="nextPage"], a:has-text("次へ"), button:has-text("次へ")').first();
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
exports.RikunabiStrategy = RikunabiStrategy;
