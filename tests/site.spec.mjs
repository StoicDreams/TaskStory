import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    test, expect, openPage, undefinedComponents,
    WEBAPP, ROOT_FILES, readJson, readText, siteOrigin, pageFiles, routeToFile, navRoutes, sitemapUrls,
    siteRoutes, isDynamicRoute, resolveSiteFile, relativeToSite,
} from './support/site.mjs';
import config from './site.config.mjs';

// These checks are the same in every site, so change them in every site at once.
// Put this site's own settings in site.config.mjs, and checks for its own pages and components in other spec files.

test.beforeEach(({ }, testInfo) => {
    const reason = config.knownBugs?.[testInfo.title];
    if (reason) test.fail(true, reason);
});

function routeExists(route) {
    const path = route.replace(/[?#].*$/, '');
    if (isDynamicRoute(path)) return true;
    return existsSync(routeToFile(path)) || !!resolveSiteFile(path);
}

test.describe('site files', () => {
    test('appConfig.json names the app', () => {
        const config = readJson(join(ROOT_FILES, 'appConfig.json'));
        expect(config.appName).toBeTruthy();
    });

    test('index.html has a title, description, and og:url', () => {
        const html = readText(join(WEBAPP, 'index.html'));
        expect(html).toMatch(/<title>[^<]+<\/title>/);
        expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]+"/);
        expect(siteOrigin(), 'og:url should be the site address').toMatch(/^https:\/\//);
    });

    test('nav.json routes have pages', () => {
        const missing = navRoutes().filter(route => !routeExists(route));
        expect(missing).toEqual([]);
    });

    test('sitemap.xml lists this site and its URLs have pages', () => {
        const origin = siteOrigin();
        const urls = sitemapUrls();
        expect(urls.length, 'sitemap.xml should list at least the home page').toBeGreaterThan(0);
        expect(urls.filter(url => new URL(url).origin !== origin), `Every URL should start with ${origin}`).toEqual([]);
        expect(urls.filter(url => !routeExists(new URL(url).pathname))).toEqual([]);
    });

    test('robots.txt points to this site\'s sitemap', () => {
        const robots = readText(join(ROOT_FILES, 'robots.txt'));
        expect(robots).toContain(`Sitemap: ${siteOrigin()}/sitemap.xml`);
    });

    test('links between pages go to pages that exist', () => {
        const broken = [];
        for (const file of pageFiles()) {
            const text = readText(file);
            const links = [
                ...[...text.matchAll(/\bhref="(\/[^"]*)"/g)].map(match => match[1]),
                ...[...text.matchAll(/\]\((\/[^)\s]*)\)/g)].map(match => match[1]),
            ];
            for (const link of links) {
                if (link.startsWith('//') || routeExists(link)) continue;
                broken.push(`${relativeToSite(file)} -> ${link}`);
            }
        }
        expect(broken).toEqual([]);
    });

    test('every component source file has a min file', () => {
        const wc = join(WEBAPP, 'wc');
        const sources = existsSync(wc) ? readdirSync(wc).filter(name => name.endsWith('.js') && !name.endsWith('.min.js')) : [];
        const missing = sources.filter(name => !existsSync(join(wc, name.replace(/\.js$/, '.min.js'))));
        expect(missing, 'Regenerate with: esbuild --minify --legal-comments=inline name.js --outfile=name.min.js').toEqual([]);
    });
});

test.describe('pages', () => {
    for (const route of siteRoutes().filter(route => !isDynamicRoute(route) && !resolveSiteFile(route))) {
        test(`${route} loads`, async ({ page }) => {
            await openPage(page, route);
            await expect(page.locator('webui-page-not-found')).toHaveCount(0);
            const title = await page.evaluate(() => webui.getData('page-title'));
            expect(title, 'The page should set a title').toBeTruthy();
            expect(title).not.toBe('Page Not Found');
            await expect.poll(() => undefinedComponents(page), { message: 'These components never loaded' }).toEqual([]);
        });
    }
});
