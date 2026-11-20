import { test, expect, openPage, undefinedComponents, pageRoutes, screenshotRoutes, pageRoles, signIn, expectSignedIn } from '../support/site.mjs';

// Every page of the site, opened in a real browser with the framework from the CDN. The site's files are checked in
// tests/unit/site.test.mjs. Both files are the same in every site: change them all at once.

test.describe('pages', () => {
    // The screenshots sign in with these roles, so they must be enough to show the page's content.
    for (const route of screenshotRoutes().filter(route => pageRoles(route) !== 0)) {
        test(`${route} shows its content to the screenshot user`, async ({ page }) => {
            const roles = pageRoles(route);
            await signIn(page, roles);
            await openPage(page, route);
            await expectSignedIn(page, roles);
            await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('webui-restrict-to-role')]
                .filter(el => el.getAttribute('role') !== '0' && el._showing !== 'content')
                .map(el => `role="${el.getAttribute('role')}"`)), { message: 'The test user from pageRoles should see every restricted section' }).toEqual([]);
        });
    }

    for (const route of pageRoutes()) {
        test(`${route} loads`, async ({ page }) => {
            await openPage(page, route);
            await expect(page.locator('webui-page-not-found')).toHaveCount(0);
            const title = () => page.evaluate(() => webui.getData('page-title'));
            await expect.poll(title, { message: 'The page should set a title' }).toBeTruthy();
            await expect.poll(title).not.toBe('Page Not Found');
            await expect.poll(() => undefinedComponents(page), { message: 'These components never loaded' }).toEqual([]);
            // The app's own rendering replaces the prerendered text, so it never shows twice.
            await expect(page.locator('[data-prerendered]')).toHaveCount(0);
        });
    }
});
