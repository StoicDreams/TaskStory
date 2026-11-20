import { test as base, expect, request as apiRequest } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { MIME, ROOT_FILES, inside, readJson, resolveSiteFile, servedHtml } from './site-files.mjs';

// The browser test harness: Playwright pages of the site, answered from webapp/ with the framework from the live CDN or a
// MyFiCDN checkout. The site's files are read by ./site-files.mjs, whose helpers this re-exports for the browser tests
// and screenshots. This file is the same in every site: change them all at once.
export * from './site-files.mjs';

/**
 * Signs the page in as a test user with the given roles (see pageRoles) by answering the site's rolesApi.
 * Call it before the page opens. Nothing reaches a real account: every other API request still gets the default answer.
 */
export async function signIn(page, roles) {
    const config = readJson(join(ROOT_FILES, 'appConfig.json'));
    if (!config.appApi || !config.rolesApi) throw new Error('appConfig.json needs appApi and rolesApi to sign in');
    const rolesUrl = new URL(config.rolesApi, config.appApi.replace(/\/?$/, '/'));
    await page.route(url => url.origin === rolesUrl.origin && url.pathname === rolesUrl.pathname, route => route.fulfill({
        headers: {
            'access-control-allow-origin': route.request().headers().origin || new URL(page.url()).origin,
            'access-control-allow-credentials': 'true',
        },
        contentType: 'text/plain',
        body: String(roles),
    }));
}

/** Waits until the page has loaded the signed-in user's roles. */
export async function expectSignedIn(page, roles) {
    await expect.poll(() => page.evaluate(() => webui.getData('session-user-role')), { message: 'The test user never signed in' }).toBe(roles);
}


// The live-cdn project serves the framework files live-cdn.setup.mjs downloaded once for the run. Any other file from
// cdn.myfi.ws is downloaded once per test worker and kept, instead of once per test. Thousands of requests per run meant a dropped connection (such as net::ERR_NETWORK_CHANGED) now and then,
// which failed whichever test it hit. A failed download is retried, and if it never succeeds the browser asks itself.
const liveCdn = new Map();
const LIVE_CDN_ORIGIN = 'https://cdn.myfi.ws';
// Sites load the framework from the local MyFiCDN server when they run on localhost, as the tests do, so its
// requests are answered the same as cdn.myfi.ws: from the live CDN, or from the local-cdn project's checkout.
const CDN_ORIGINS = new Set([LIVE_CDN_ORIGIN, 'http://localhost:3180']);
let liveCdnClient;
// A file takes well under a second, so a download that stalls is given up on soon enough to retry within one test.
const LIVE_CDN_ATTEMPTS = 4;
const LIVE_CDN_TIMEOUT = 5000;

async function downloadLiveCdn(url) {
    liveCdnClient ??= await apiRequest.newContext();
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await liveCdnClient.get(url, { timeout: LIVE_CDN_TIMEOUT });
            if (response.status() < 500 || attempt === LIVE_CDN_ATTEMPTS) {
                return { status: response.status(), contentType: response.headers()['content-type'], body: await response.body() };
            }
        } catch (error) {
            if (attempt === LIVE_CDN_ATTEMPTS) return null;
        }
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
    }
}

// The files live-cdn.setup.mjs downloaded for this run before the workers started, as { path: { status, contentType } }.
let liveCdnCache;
function cachedLiveCdn(pathname) {
    const dir = process.env.LIVE_CDN_CACHE;
    if (!dir) return null;
    if (liveCdnCache === undefined) {
        try { liveCdnCache = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')); } catch { liveCdnCache = null; }
    }
    const path = decodeURIComponent(pathname).replace(/^\/+/, '');
    const entry = liveCdnCache?.[path];
    if (!entry) return null;
    try { return { ...entry, body: readFileSync(join(dir, path)) }; } catch { return null; }
}

export async function serveLiveCdn(route, headers = {}) {
    const request = route.request();
    if (request.method() !== 'GET') return route.continue();
    const pathname = new URL(request.url()).pathname;
    const cached = cachedLiveCdn(pathname);
    if (cached) return route.fulfill({ headers, status: cached.status, contentType: cached.contentType, body: cached.body });
    const url = `${LIVE_CDN_ORIGIN}${pathname}`;
    if (!liveCdn.has(url)) liveCdn.set(url, downloadLiveCdn(url));
    const file = await liveCdn.get(url);
    if (!file) {
        liveCdn.delete(url);
        // The browser can ask cdn.myfi.ws itself, but never the local server, so the tests do not depend on it running.
        return new URL(request.url()).origin === LIVE_CDN_ORIGIN ? route.continue() : route.abort();
    }
    return route.fulfill({ headers, status: file.status, contentType: file.contentType, body: file.body });
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
    if (CDN_ORIGINS.has(url.origin)) {
        if (!cdnDir) return serveLiveCdn(route, headers);
        const file = inside(cdnDir, url.pathname);
        if (file) return route.fulfill({ headers, contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
        if (url.origin === LIVE_CDN_ORIGIN) return route.continue();
        return route.fulfill({ headers, status: 404, contentType: 'text/plain', body: 'Not Found' });
    }
    if (url.origin !== origin) {
        // Analytics, embeds, and other outside requests are blocked, so tests never count as real visits.
        return route.abort();
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
        return route.fulfill({ contentType: 'text/html', body: servedHtml('/') });
    }
    const file = resolveSiteFile(url.pathname);
    if (file) {
        return route.fulfill({ headers, contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    }
    if (extname(url.pathname)) {
        return route.fulfill({ headers, status: 404, contentType: 'text/plain', body: 'Not Found' });
    }
    // Page routes get their prerendered page, or fall back to the home page, the same as the deployed site.
    return route.fulfill({ contentType: 'text/html', body: servedHtml(url.pathname) });
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
 * Open a page of the site and wait until it is ready: the loader has put the page's content in place and finished
 * its fade, every component on the page is defined, and the content in view has loaded.
 */
export async function openPage(page, route) {
    await page.goto(route);
    await pageReady(page);
}

/**
 * Waits for a page the loader is loading, or has loaded, to be ready. openPage calls it, and a test that goes to
 * another page by a link or webui.navigateTo calls it after waiting for the new address.
 */
export async function pageReady(page) {
    // The loader sets the page title in the same step that puts the content in place (or shows the not-found page),
    // and takes the transition class off once the fade is over. Before that the app shell has neither.
    await page.waitForFunction(() => {
        if (typeof webui !== 'object' || !webui.loaded || !webui.appConfig?.appName) return false;
        const app = document.querySelector('webui-app');
        if (!app?.main || app.main.classList.contains('transition')) return false;
        return !!webui.getData('page-title') || !!document.querySelector('webui-page-not-found');
    });
    // Components load their scripts on demand, and loaded content can bring more components, so this checks again
    // until nothing is left. Pages such as a component list load dozens of scripts, which takes a while on a slow or busy machine.
    await expect.poll(() => unfinishedLoading(page), { message: 'The page never finished loading these' }).toEqual([]);
}

/**
 * What a page is still loading: components without a definition, and webui-content in view that has not shown its
 * source yet. Content out of view is left out, because it only loads once it is scrolled to.
 */
export async function unfinishedLoading(page) {
    return page.evaluate(async () => {
        const all = (root, found = []) => {
            for (const el of root.querySelectorAll('*')) {
                found.push(el);
                if (el.shadowRoot) all(el.shadowRoot, found);
            }
            return found;
        };
        const elements = all(document);
        const tags = new Set(elements.map(el => el.localName).filter(name => /^(webui|app)-/.test(name)));
        const waiting = [...tags].filter(tag => !customElements.get(tag)).sort();
        if (waiting.length) return waiting;
        const contents = elements.filter(el => el.localName === 'webui-content');
        if (!contents.length) return [];
        // The loader marks content as visible from its own IntersectionObserver. Observers report in the order they
        // were made, so once this one has reported, the loader's has already marked everything now in view.
        await new Promise(resolve => {
            const observer = new IntersectionObserver(() => {
                observer.disconnect();
                resolve();
            });
            contents.forEach(el => observer.observe(el));
        });
        return contents
            .filter(el => el.isConnected && el.hasAttribute('visible') && !el.classList.contains('loaded'))
            .filter(el => el.getAttribute('src') && el.getAttribute('src') !== 'html')
            .map(el => `webui-content src="${el.getAttribute('src')}"`);
    });
}

/** Custom element tags on the page that never loaded a definition. */
export async function undefinedComponents(page) {
    return page.evaluate(() => {
        const tags = new Set([...document.querySelectorAll('*')].map(el => el.localName).filter(name => /^(webui|app)-/.test(name)));
        return [...tags].filter(tag => !customElements.get(tag)).sort();
    });
}
