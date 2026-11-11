import { test, expect, openPage, pageFiles, readText, ROOT_FILES } from './support/site.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

test.describe('app-hero', () => {
    test('shows the home page pitch beside the dashboard screenshot, and Try It Free opens the dashboard', async ({ page }) => {
        await openPage(page, '/');
        const hero = page.locator('app-hero');
        await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Track the problem, not just the ticket.');
        const image = hero.locator('img');
        await expect(image).toHaveAttribute('src', '/img/screenshots/dashboard.png');
        await expect(image).toHaveAttribute('alt', /dashboard/);
        await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth)).toBeGreaterThan(0);
        await hero.getByRole('link', { name: 'Try It Free' }).click();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.locator('app-workspace')).toContainText('Sign in with your Stoic Dreams account');
    });

    test('without an image, only the content shows', async ({ page }) => {
        await openPage(page, '/help/workflow');
        await page.evaluate(() => {
            const hero = webui.create('app-hero');
            hero.appendChild(webui.create('h1', { text: 'Plain' }));
            document.querySelector('webui-app').appendChild(hero);
        });
        const hero = page.locator('app-hero');
        await expect(hero).toContainText('Plain');
        await expect(hero.locator('img')).toBeHidden();
    });

    test('stacks the image under the content on a phone, without scrolling sideways', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await openPage(page, '/');
        const hero = page.locator('app-hero');
        await expect(hero.locator('img')).toBeVisible();
        const [heading, image] = await Promise.all([hero.getByRole('heading', { level: 1 }).boundingBox(), hero.locator('img').boundingBox()]);
        expect(image.y).toBeGreaterThan(heading.y + heading.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
});

test.describe('marketing pages', () => {
    test('every image a page uses from /img exists', () => {
        const missing = [];
        for (const file of pageFiles()) {
            for (const [, path] of readText(file).matchAll(/(?:src|image)="(\/img\/[^"]+)"/g)) {
                if (!existsSync(join(ROOT_FILES, path))) missing.push(`${file}: ${path}`);
            }
        }
        expect(missing).toEqual([]);
        expect(existsSync(join(ROOT_FILES, 'img', 'share.png'))).toBe(true);
    });

    test('/continuous-agile-software-engineering is its own guide and links back to the app', async ({ page }) => {
        await openPage(page, '/continuous-agile-software-engineering');
        await expect(page.locator('webui-app')).toContainText('Start with the problem');
        await expect(page.locator('app-hero')).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Try It Free' })).toBeVisible();
    });

    test('the CASE guide lists its sections, and each link scrolls to its section on the same page', async ({ page }) => {
        await openPage(page, '/continuous-agile-software-engineering');
        const links = page.locator('webui-app a[href^="#"]');
        await expect(links).toHaveCount(7);
        for (const href of await links.evaluateAll(all => all.map(a => a.getAttribute('href')))) {
            await expect(page.locator(`webui-app [id="${href.slice(1)}"]`), `${href} needs a heading with that id`).toHaveCount(1);
        }
        await page.evaluate(() => { window.__sameDocument = true; });
        await page.getByRole('link', { name: 'Organize with tags, not hierarchies' }).click();
        await expect(page).toHaveURL(/\/continuous-agile-software-engineering#tags$/);
        await expect(page.locator('#tags')).toBeInViewport();
        expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
    });

    test('the old /agile-project-management address redirects to the CASE guide', () => {
        const config = readText(join(ROOT_FILES, 'web.config'));
        const redirect = config.indexOf('<match url="^agile-project-management/?$"');
        expect(redirect, 'web.config needs a redirect rule for the old address').toBeGreaterThan(-1);
        expect(config.slice(redirect, config.indexOf('</rule>', redirect))).toContain('url="/continuous-agile-software-engineering" redirectType="Permanent"');
        // IIS stops at the first matching rule, so the redirect has to come before the rewrite to the app.
        expect(redirect).toBeLessThan(config.indexOf('<rule name="Rewrite To SPA"'));
    });

    test('Read about CASE opens the CASE page on softwarestandards.dev', async ({ page }) => {
        await page.route('https://www.softwarestandards.dev/**', route => route.fulfill({ contentType: 'text/html', body: '<p>CASE</p>' }));
        await openPage(page, '/');
        await page.getByRole('link', { name: 'Read about CASE' }).click();
        await expect(page).toHaveURL('https://www.softwarestandards.dev/continuous-agile-software-engineering', { timeout: 5000 });
    });
});
