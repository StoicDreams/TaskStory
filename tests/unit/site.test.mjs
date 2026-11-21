import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';
import {
    WEBAPP, ROOT_FILES, readJson, readText, siteOrigin, pageFiles, routeToFile, navRoutes, sitemapUrls,
    screenshotRoutes, pageRoutes, pageScreenshotFile, isDynamicRoute, resolveSiteFile, relativeToSite,
    PRERENDERED, prerenderedFile, sourceVersion, fileToRoute, themeVariables, themeContrastProblems, normalizeThemeValue,
} from '../support/site-files.mjs';

// The site's files, checked in Node: its config, links, sitemap, prerendered pages, theme, and tests for every component.
// Its pages are opened in tests/browser/site.spec.mjs. Both files are the same in every site: change them all at once.
// Put this site's own settings in tests/site.config.mjs, and tests for its own pages and components in files of their own.

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

    test('a folder with its own index.html is served that file, and is not one of the app\'s pages', () => {
        const folders = [];
        const walk = dir => {
            for (const name of readdirSync(dir)) {
                const path = join(dir, name);
                if (!statSync(path).isDirectory()) continue;
                if (existsSync(join(path, 'index.html'))) folders.push(path);
                walk(path);
            }
        };
        walk(ROOT_FILES);
        for (const folder of folders) {
            const route = `/${relative(ROOT_FILES, folder).split(sep).join('/')}`;
            for (const address of [route, `${route}/`]) {
                expect(resolveSiteFile(address), address).toBe(join(folder, 'index.html'));
                expect(pageRoutes(), address).not.toContain(address);
            }
        }
        expect(resolveSiteFile('/'), 'the home page is the app, not a file').toBeNull();
    });

    test('theme colors are readable with their text colors', () => {
        // Text on a theme color, such as a button or alert, needs 4.5:1 contrast (WCAG AA) to be readable.
        expect(themeContrastProblems(), 'Darken the color, or give it dark text, in webapp/css/app.css').toEqual([]);
    });

    test('app.min.css has the same theme colors as app.css', () => {
        const source = join(WEBAPP, 'css', 'app.css'), min = join(WEBAPP, 'css', 'app.min.css');
        if (!existsSync(source) || !existsSync(min)) return;
        const normalize = vars => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, normalizeThemeValue(v)]));
        expect(normalize(themeVariables(readText(min))), 'Regenerate with: pwsh ./PowerShell/Minify.ps1')
            .toEqual(normalize(themeVariables(readText(source))));
    });

    test('every component source file has a min file', () => {
        const wc = join(WEBAPP, 'wc');
        const sources = existsSync(wc) ? readdirSync(wc).filter(name => name.endsWith('.js') && !name.endsWith('.min.js')) : [];
        const missing = sources.filter(name => !existsSync(join(wc, name.replace(/\.js$/, '.min.js'))));
        expect(missing, 'Regenerate with: pwsh ./PowerShell/Minify.ps1').toEqual([]);
    });

    test('every site component is named in a spec file', () => {
        // A component counts as tested when a test file of either tier, other than the shared ones, names its tag.
        const wc = join(WEBAPP, 'wc');
        const components = existsSync(wc) ? readdirSync(wc).filter(name => name.endsWith('.js') && !name.endsWith('.min.js')).map(name => name.replace(/\.js$/, '')) : [];
        const dir = folder => fileURLToPath(new URL(folder, import.meta.url));
        const files = [[dir('./'), '.test.mjs'], [dir('../browser/'), '.spec.mjs']].flatMap(([folder, ending]) => existsSync(folder)
            ? readdirSync(folder).filter(name => name.endsWith(ending) && !name.startsWith('site.')).map(name => readText(join(folder, name)))
            : []).join('\n');
        const missing = components.filter(name => !files.includes(`app-${name}`));
        expect(missing, 'Add tests for these components in a test file of their own').toEqual([]);
    });
});

// Release builds serve these pages, so search engines and link previews get each page's own title, description, and
// text without running JavaScript. Publish.ps1 writes them with `webapp_post_build prerender`, before the tests.
const REGENERATE = 'Regenerate with: pwsh ./PowerShell/Publish.ps1, or webapp_post_build prerender in webapp';
const DESCRIPTION_LENGTH = { min: 50, max: 160 };

/** Markdown files the build prerenders: every page except dynamic routes. */
function prerenderedPages() {
    return pageFiles().map(file => ({ file, route: fileToRoute(file) })).filter(({ route }) => !isDynamicRoute(route));
}

test.describe('prerendered pages', () => {
    test(`every page sets a description of ${DESCRIPTION_LENGTH.min} to ${DESCRIPTION_LENGTH.max} characters`, () => {
        // Search results and link previews show it. Without one, the build cuts the page's first paragraph short.
        const problems = [];
        for (const { file } of prerenderedPages()) {
            // The app and the build read every webui-data tag on the page, and a later value wins.
            const description = [...readText(file).matchAll(/<webui-data\b[^>]*>/gi)]
                .map(tag => tag[0].match(/\bdata-page-description="([^"]*)"/i)?.[1]).filter(v => v !== undefined).at(-1)?.trim();
            if (!description) problems.push(`${relativeToSite(file)}: no data-page-description`);
            else if (description.length < DESCRIPTION_LENGTH.min || description.length > DESCRIPTION_LENGTH.max) {
                problems.push(`${relativeToSite(file)}: ${description.length} characters`);
            }
        }
        expect(problems).toEqual([]);
    });

    test('every page has a prerendered file', () => {
        const missing = prerenderedPages().filter(({ route }) => !prerenderedFile(route)).map(({ route }) => route);
        expect(missing, REGENERATE).toEqual([]);
    });

    test('webapp/pages has no file for a page that was removed', () => {
        const routes = new Set(prerenderedPages().map(({ route }) => route));
        const extra = [];
        const walk = dir => {
            for (const name of readdirSync(dir)) {
                const file = join(dir, name);
                if (statSync(file).isDirectory()) { walk(file); continue; }
                const path = relative(PRERENDERED, file).split(sep).join('/');
                const route = path === 'index.html' ? '/' : `/${path.replace(/\.html$/, '')}`;
                if (!routes.has(route)) extra.push(path);
            }
        };
        if (existsSync(PRERENDERED)) walk(PRERENDERED);
        expect(extra, REGENERATE).toEqual([]);
    });

    test('prerendered pages were written from the current index.html, appConfig.json, and page', () => {
        // The app keeps the header, footer, and drawers from the page it was served, so a stale page shows an old shell.
        const index = readFileSync(join(WEBAPP, 'index.html')), config = readFileSync(join(ROOT_FILES, 'appConfig.json'));
        const stale = prerenderedPages().filter(({ route }) => prerenderedFile(route)).filter(({ file, route }) => {
            const written = readText(prerenderedFile(route)).match(/<meta name="webui-prerender" content="([0-9a-f]+)">/)?.[1];
            return written !== sourceVersion(index, config, readFileSync(file));
        }).map(({ route }) => route);
        expect(stale, REGENERATE).toEqual([]);
    });

    test('prerendered pages link to the current CSS and JavaScript', () => {
        // The ?v= is a hash of the file, so browsers fetch it again when it changes.
        const stale = new Set();
        for (const { route } of prerenderedPages()) {
            const file = prerenderedFile(route);
            if (!file) continue;
            for (const [, path, version] of readText(file).matchAll(/(?:href|src)="([^"?#:]+)\?v=([0-9a-f]+)"/g)) {
                const asset = resolveSiteFile(`/${path.replace(/^\/+/, '')}`);
                if (!asset || sourceVersion(readFileSync(asset)) !== version) stale.add(path);
            }
        }
        expect([...stale], REGENERATE).toEqual([]);
    });
});

test('every page in nav.json has a screenshot from screenshots/pages.shots.mjs', () => {
    // PowerShell/screenshots.ps1 takes them, and Publish.ps1 runs it before the tests.
    const missing = screenshotRoutes().filter(route => !existsSync(pageScreenshotFile(route)));
    expect(missing, 'Run PowerShell/screenshots.ps1 to capture these pages').toEqual([]);
});
