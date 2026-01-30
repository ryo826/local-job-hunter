/**
 * Mynavi Scraping Diagnosis Script
 *
 * Purpose: Identify why Mynavi scraping returns 0 results
 *
 * Usage:
 *   cd /home/user/local-job-hunter
 *   node test-mynavi-diagnosis.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function diagnose() {
    console.log('='.repeat(60));
    console.log('Mynavi Scraping Diagnosis');
    console.log('='.repeat(60));

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        // Step 1: Navigate to search page
        const searchUrl = 'https://tenshoku.mynavi.jp/list/';
        console.log(`\n[Step 1] Navigating to: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        // Get current URL (check for redirects)
        const currentUrl = page.url();
        console.log(`[Step 1] Current URL: ${currentUrl}`);

        // Check page title
        const title = await page.title();
        console.log(`[Step 1] Page Title: ${title}`);

        // Step 2: Take screenshot for visual inspection
        const screenshotPath = path.join(__dirname, 'mynavi-diagnosis-screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`\n[Step 2] Screenshot saved to: ${screenshotPath}`);

        // Step 3: Check if there's any bot detection or CAPTCHA
        console.log('\n[Step 3] Checking for bot detection...');
        const captchaIndicators = await page.locator('text=/CAPTCHA|reCAPTCHA|ロボット|bot|認証/i').count();
        if (captchaIndicators > 0) {
            console.log('WARNING: Bot detection or CAPTCHA may be present!');
        } else {
            console.log('No obvious bot detection found');
        }

        // Step 4: Analyze page structure - find job cards
        console.log('\n[Step 4] Analyzing page structure...');

        // Current selectors in mynavi.ts
        const currentSelectors = [
            '.cassetteRecruit',
            '[class*="recruitList"] > li',
            'article[class*="recruit"]'
        ];

        // Alternative selectors to try
        const alternativeSelectors = [
            '.cassetteRecruit__content',
            '.cassetteRecruit__heading',
            '[class*="job"]',
            '[class*="recruit"]',
            '[class*="cassette"]',
            'article',
            '.searchResult',
            '.jobList',
            '.resultList',
            '[data-test]',
            '[data-testid]',
            'li[class*="result"]',
            '.jobCard',
            '.company-cassette',
            '.recruit-cassette'
        ];

        console.log('\nTesting CURRENT selectors from mynavi.ts:');
        for (const selector of currentSelectors) {
            const count = await page.locator(selector).count();
            console.log(`  "${selector}": ${count} elements`);
        }

        console.log('\nTesting ALTERNATIVE selectors:');
        for (const selector of alternativeSelectors) {
            const count = await page.locator(selector).count();
            if (count > 0) {
                console.log(`  "${selector}": ${count} elements`);
            }
        }

        // Step 5: Get all classes on the page that might contain job listings
        console.log('\n[Step 5] Extracting relevant class names from page...');
        const classNames = await page.evaluate(() => {
            const classes = new Set();
            document.querySelectorAll('*').forEach(el => {
                if (el.className && typeof el.className === 'string') {
                    el.className.split(' ').forEach(c => {
                        if (c && (
                            c.toLowerCase().includes('job') ||
                            c.toLowerCase().includes('recruit') ||
                            c.toLowerCase().includes('cassette') ||
                            c.toLowerCase().includes('card') ||
                            c.toLowerCase().includes('result') ||
                            c.toLowerCase().includes('list') ||
                            c.toLowerCase().includes('item')
                        )) {
                            classes.add(c);
                        }
                    });
                }
            });
            return Array.from(classes).sort();
        });

        console.log('Relevant class names found:');
        classNames.forEach(c => console.log(`  .${c}`));

        // Step 6: Find links that might be job detail links
        console.log('\n[Step 6] Checking for job detail links...');
        const jobDetailLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            return links
                .map(a => a.getAttribute('href'))
                .filter(href => href && (
                    href.includes('/job') ||
                    href.includes('/recruit') ||
                    href.includes('/detail') ||
                    href.includes('/msg')
                ))
                .slice(0, 10); // First 10 links
        });

        console.log('Sample job-related links found:');
        jobDetailLinks.forEach(link => console.log(`  ${link}`));

        // Step 7: Get HTML structure of first job-like element
        console.log('\n[Step 7] Extracting sample HTML structure...');
        const sampleHtml = await page.evaluate(() => {
            // Try to find any element that looks like a job card
            const selectors = [
                '.cassetteRecruit',
                '[class*="cassette"]',
                '[class*="recruit"]',
                'article',
                '.searchResult li',
                '[class*="jobCard"]'
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                    // Get outer HTML but truncate if too long
                    let html = el.outerHTML;
                    if (html.length > 2000) {
                        html = html.substring(0, 2000) + '... [truncated]';
                    }
                    return { selector, html };
                }
            }

            // If nothing found, get the main content area
            const main = document.querySelector('main') || document.querySelector('#contents') || document.querySelector('.contents');
            if (main) {
                let html = main.innerHTML.substring(0, 3000);
                return { selector: 'main/contents', html: html + '... [truncated]' };
            }

            return { selector: 'none', html: 'No job elements found' };
        });

        console.log(`Found element with selector: ${sampleHtml.selector}`);

        // Save sample HTML for analysis
        const htmlPath = path.join(__dirname, 'mynavi-diagnosis-sample.html');
        fs.writeFileSync(htmlPath, sampleHtml.html);
        console.log(`Sample HTML saved to: ${htmlPath}`);

        // Step 8: Check for any error messages on page
        console.log('\n[Step 8] Checking for error messages...');
        const errorMessages = await page.evaluate(() => {
            const errorSelectors = ['.error', '.alert', '.warning', '[class*="error"]', '[class*="message"]'];
            const errors = [];
            errorSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    const text = el.textContent?.trim();
                    if (text && text.length > 5 && text.length < 200) {
                        errors.push(text);
                    }
                });
            });
            return errors.slice(0, 5);
        });

        if (errorMessages.length > 0) {
            console.log('Error/message elements found:');
            errorMessages.forEach(msg => console.log(`  - ${msg}`));
        } else {
            console.log('No error messages found');
        }

        // Step 9: Count total links and elements
        console.log('\n[Step 9] Page statistics...');
        const stats = await page.evaluate(() => {
            return {
                totalLinks: document.querySelectorAll('a').length,
                totalArticles: document.querySelectorAll('article').length,
                totalLists: document.querySelectorAll('ul, ol').length,
                totalListItems: document.querySelectorAll('li').length,
                totalDivs: document.querySelectorAll('div').length
            };
        });
        console.log(`  Total links: ${stats.totalLinks}`);
        console.log(`  Total articles: ${stats.totalArticles}`);
        console.log(`  Total lists (ul/ol): ${stats.totalLists}`);
        console.log(`  Total list items: ${stats.totalListItems}`);
        console.log(`  Total divs: ${stats.totalDivs}`);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('DIAGNOSIS SUMMARY');
        console.log('='.repeat(60));

        const cassetteCount = await page.locator('.cassetteRecruit').count();
        if (cassetteCount === 0) {
            console.log('\nPROBLEM IDENTIFIED: The selector ".cassetteRecruit" returns 0 elements.');
            console.log('The website structure has likely changed.');
            console.log('\nRECOMMENDATION: Update the selectors in electron/strategies/mynavi.ts');
            console.log('based on the class names and HTML structure found above.');
        } else {
            console.log(`\nThe selector ".cassetteRecruit" found ${cassetteCount} elements.`);
            console.log('The issue may be in the detail extraction logic.');
        }

    } catch (error) {
        console.error('\nERROR during diagnosis:', error.message);
        console.error(error.stack);
    } finally {
        await browser.close();
        console.log('\n[Done] Browser closed');
    }
}

diagnose().catch(console.error);
