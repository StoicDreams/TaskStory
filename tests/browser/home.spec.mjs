import { test, expect, openPage } from '../support/site.mjs';

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

});

test.describe('marketing pages', () => {

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
        await expect.poll(() => page.evaluate(() => window.__sameDocument)).toBe(true);
    });

});
