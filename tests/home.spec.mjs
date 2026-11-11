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

    test('/agile-project-management is its own guide and links back to the app', async ({ page }) => {
        await openPage(page, '/agile-project-management');
        await expect(page.locator('webui-app')).toContainText('Start with the problem');
        await expect(page.locator('app-hero')).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Try It Free' })).toBeVisible();
    });
});
