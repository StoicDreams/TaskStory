import { test as base, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the site straight from webapp/, laid out the way Trunk copies it into dist/, so tests need no build or server.
export const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const WEBAPP = join(SITE_ROOT, 'webapp');
export const ROOT_FILES = join(WEBAPP, 'root_files');
export const PAGES = join(WEBAPP, 'd');


const MIME = {
    '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.gif': 'image/gif', '.wasm': 'application/wasm',
    '.md': 'text/plain', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

export function readText(file) {
    return readFileSync(file, 'utf8');
}

export function readJson(file) {
    return JSON.parse(readText(file).replace(/^﻿/, ''));
}

function inside(root, pathname) {
    const file = normalize(join(root, decodeURIComponent(pathname)));
    if (file !== root && !file.startsWith(root + sep)) return null;
    return existsSync(file) && statSync(file).isFile() ? file : null;
}

// Trunk copies root_files/ and pkg/ to the site root, and worker.js from src-js/.
export function resolveSiteFile(pathname) {
    return inside(ROOT_FILES, pathname)
        || inside(WEBAPP, pathname)
        || inside(join(WEBAPP, 'pkg'), pathname)
        || inside(join(WEBAPP, 'src-js'), pathname);
}

// Trunk rewrites its data-trunk links at build time. Do the parts the browser needs, so site CSS still applies.
function appShell() {
    return readText(join(WEBAPP, 'index.html'))
        .replace(/<link\b[^>]*\bdata-trunk\b[^>]*>/g, tag => {
            const href = tag.match(/href="([^"]+)"/)?.[1];
            return /rel="css"/.test(tag) && href ? `<link href="${href}" rel="stylesheet" />` : '';
        })
        .replace(/<script\b([^>]*)\bdata-trunk\b/g, '<script$1');
}

/** The site's own domain, read from the og:url in index.html. */
export function siteOrigin() {
    const url = readText(join(WEBAPP, 'index.html')).match(/<meta\s+property="og:url"\s+content="([^"]+)"/)?.[1];
    return url ? new URL(url).origin : null;
}

/** Every markdown file under webapp/d, as a route. d/root.md is "/". */
export function pageFiles() {
    const files = [];
    const walk = dir => {
        for (const name of readdirSync(dir)) {
            const file = join(dir, name);
            if (statSync(file).isDirectory()) walk(file);
            else if (name.endsWith('.md')) files.push(file);
        }
    };
    if (existsSync(PAGES)) walk(PAGES);
    return files;
}

export function routeToFile(route) {
    const path = route.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    return path === '' ? join(PAGES, 'root.md') : join(PAGES, `${path}.md`);
}

/** Routes in nav.json, including nested children. */
export function navRoutes() {
    const routes = [];
    const walk = items => {
        for (const item of items || []) {
            if (typeof item.url === 'string') routes.push(item.url);
            walk(item.children);
        }
    };
    walk(readJson(join(ROOT_FILES, 'nav.json')));
    return routes;
}

/** URLs listed in sitemap.xml. */
export function sitemapUrls() {
    const file = join(ROOT_FILES, 'sitemap.xml');
    if (!existsSync(file)) return [];
    return [...readText(file).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(match => match[1]);
}

/** Site links in the app shell, such as the footer links. */
export function shellRoutes() {
    const body = readText(join(WEBAPP, 'index.html')).split(/<body[^>]*>/)[1] || '';
    return [...body.matchAll(/href="(\/[^"]*)"/g)].map(match => match[1]);
}

export function isDynamicRoute(route) {
    let dynamic = [];
    try {
        dynamic = readJson(join(ROOT_FILES, 'appConfig.json')).dynNavRoutes || [];
    } catch { }
    return dynamic.some(prefix => route.toLowerCase().startsWith(prefix));
}

/** Every page the site links to: the home page, nav.json, the sitemap, and the app shell. */
export function siteRoutes() {
    const routes = new Set(['/']);
    for (const route of navRoutes()) routes.add(route);
    for (const url of sitemapUrls()) routes.add(new URL(url).pathname);
    for (const route of shellRoutes()) routes.add(route);
    return [...routes]
        .filter(route => route.startsWith('/') && !route.startsWith('//'))
        .map(route => route.replace(/[?#].*$/, '') || '/')
        .filter((route, index, all) => all.indexOf(route) === index)
        .sort();
}

export function relativeToSite(file) {
    return relative(SITE_ROOT, file).split(sep).join('/');
}

function serve(route, origin, cdnDir) {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
        'access-control-allow-origin': request.headers().origin || origin,
        'access-control-allow-credentials': 'true',
    };
    // Tests replace this default with page.route when they need a specific API response.
    if (url.hostname === 'api.myfi.ws') {
        return route.fulfill({ headers, contentType: 'text/plain', body: '0' });
    }
    if (url.hostname === 'cdn.myfi.ws') {
        if (!cdnDir) return route.continue();
        const file = inside(cdnDir, url.pathname);
        if (file) return route.fulfill({ headers, contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
        return route.continue();
    }
    if (url.origin !== origin) {
        // Analytics, embeds, and other outside requests are blocked, so tests never count as real visits.
        return route.abort();
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
        return route.fulfill({ contentType: 'text/html', body: appShell() });
    }
    const file = resolveSiteFile(url.pathname);
    if (file) {
        return route.fulfill({ headers, contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    }
    if (extname(url.pathname)) {
        return route.fulfill({ headers, status: 404, contentType: 'text/plain', body: 'Not Found' });
    }
    // Page routes fall back to the app shell, the same as the deployed site.
    return route.fulfill({ contentType: 'text/html', body: appShell() });
}

export const test = base.extend({
    // The live-cdn project leaves this empty, and the local-cdn project points it at a MyFiCDN/cdn folder.
    cdnDir: [null, { option: true }],
    page: async ({ page, baseURL, cdnDir }, use) => {
        if (cdnDir && !existsSync(cdnDir)) throw new Error(`The local-cdn project needs a MyFiCDN checkout at ${cdnDir}`);
        const errors = [];
        page.errors = errors;
        page.on('pageerror', error => {
            // Failed requests are expected here, since outside requests are blocked during tests.
            if (error.message !== 'Failed to fetch') errors.push(error.stack || error.message);
        });
        page.on('console', message => {
            if (message.type() === 'error' && message.text().startsWith('Error setting data')) {
                errors.push(message.text());
            }
        });
        await page.exposeFunction('__reportTestError', message => errors.push(message));
        // The loader handles window errors itself, so they never reach pageerror unless reported from here.
        await page.addInitScript(() => {
            window.addEventListener('error', event => {
                window.__reportTestError(event.error?.stack || event.message);
            });
            window.addEventListener('unhandledrejection', event => {
                const reason = event.reason;
                if (reason instanceof TypeError && reason.message === 'Failed to fetch') return;
                if (reason instanceof TypeError || reason instanceof ReferenceError || reason instanceof SyntaxError) {
                    window.__reportTestError(reason.stack || `${reason}`);
                }
            });
        });
        await page.route('**/*', route => serve(route, new URL(baseURL).origin, cdnDir));
        await use(page);
        expect(errors, 'Uncaught errors happened while this test ran').toEqual([]);
    },
});

export { expect };

/**
 * Open a page of the site and wait until its content has loaded.
 * Pages fade in, so this waits for the transition to finish as well.
 */
export async function openPage(page, route) {
    await page.goto(route);
    await page.waitForFunction(() => typeof webui === 'object' && webui.loaded && webui.appConfig?.appName);
    await page.waitForFunction(() => {
        const app = document.querySelector('webui-app');
        return webui.getData('page-path') && app?.main && !app.main.classList.contains('transition');
    });
    // Pages can pull in more content, such as webui-content, and components load their scripts on demand.
    await page.waitForLoadState('networkidle');
}

/** Custom element tags on the page that never loaded a definition. */
export async function undefinedComponents(page) {
    return page.evaluate(() => {
        const tags = new Set([...document.querySelectorAll('*')].map(el => el.localName).filter(name => /^(webui|app)-/.test(name)));
        return [...tags].filter(tag => !customElements.get(tag)).sort();
    });
}
