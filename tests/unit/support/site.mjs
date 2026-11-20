// The unit test harness: the site's pages, with its minified components and the Web UI framework, running in jsdom, a
// simulated browser with no layout. Each test gets a fresh tab through the `page` fixture, so nothing a test does can
// reach another test. Tests read as they do in Playwright: `openPage(page, '/route')`, then locators, actions and
// retrying matchers from ./page.mjs.
//
// Requests are answered as tests/support/site.mjs answers them in the browser tests:
// - The site's own files come from webapp/, laid out the way Trunk copies them, and page addresses get their
//   prerendered page or the app shell.
// - Framework files (cdn.myfi.ws, or the local MyFiCDN server sites use on localhost) come from the live CDN, downloaded
//   once per run by tests/support/live-cdn.setup.mjs, or from a MyFiCDN checkout with `npm run test:local-cdn`.
// - api.myfi.ws answers 0, and anything else fails. page.route() can answer any request first.
//
// What jsdom lacks is in ./stand-ins.mjs. There is no layout: nothing has a size, and stylesheets in shadow roots do
// not reach getComputedStyle. Tests that need either are in tests/browser.
//
// This file is the same in every site: change them all at once. page.mjs, stand-ins.mjs and test-cache.mjs are copies
// of MyFiCDN's tests/unit/support files, shared with Task Proxy too.
import { IDBCursor, IDBCursorWithValue, IDBDatabase, IDBFactory, IDBIndex, IDBKeyRange, IDBObjectStore, IDBOpenDBRequest, IDBRequest, IDBTransaction, IDBVersionChangeEvent } from 'fake-indexeddb';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { afterAll, test as base } from 'vitest';
import { reads } from '../../support/tracked-fs.mjs';
import { MIME, ROOT_FILES, SITE_ROOT, readJson, resolveSiteFile, servedHtml } from '../../support/site-files.mjs';
import { Locator, Page, pageExpect as expect } from './page.mjs';
import { installStandIns, mediaMatcher, pageResponse } from './stand-ins.mjs';
import { allTestNames, cacheFor, configureCache, fromRoot, testName } from './test-cache.mjs';

export { expect };
export * from '../../support/site-files.mjs';

// The harness reads the site through these, so every test depends on them.
// tests/helpers holds a site's own helpers for both tiers, when it has any.
configureCache({ harness: ['tests/support/site-files.mjs', 'tests/support/tracked-fs.mjs', 'tests/support/live-cdn.setup.mjs', 'tests/helpers'] });

// jsdom does not load another page when a page leaves for one, by a link or by setting location. Its navigate is replaced
// before jsdom loads, which keeps it, so a window with a __leaveTo hook loads the page there, as a browser does.
const require = createRequire(import.meta.url);
const navigation = require('jsdom/lib/jsdom/living/window/navigation.js');
const { serializeURL } = createRequire(require.resolve('jsdom'))('whatwg-url');
const jsdomNavigate = navigation.navigate;
navigation.navigate = (window, url, flags) => {
    const current = window._document?._URL;
    const sameDocument = current && serializeURL(current, true) === serializeURL(url, true) && !flags.reloadTriggered;
    if (window.__leaveTo && !sameDocument && url.scheme !== 'javascript') window.__leaveTo(serializeURL(url));
    else jsdomNavigate(window, url, flags);
};
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');
// The same address the browser tests use, from playwright.config.mjs.
export const ORIGIN = new URL(readFileSync(join(SITE_ROOT, 'playwright.config.mjs'), 'utf8').match(/baseURL:\s*'([^']+)'/)?.[1] || 'http://localhost:8080').origin;
const LIVE_CDN_ORIGIN = 'https://cdn.myfi.ws';
// Sites load the framework from the local MyFiCDN server when they run on localhost, so it is answered the same way.
const CDN_ORIGINS = new Set([LIVE_CDN_ORIGIN, 'http://localhost:3180']);
// A MyFiCDN checkout's cdn folder (npm run test:local-cdn), or the live CDN files downloaded for this run.
const LOCAL_CDN = process.env.WEBUI_CDN_ROOT;
const LIVE_CDN_CACHE = join(SITE_ROOT, 'node_modules', '.cache', 'live-cdn');
// The window size the browser tests use, which pages read for their wide layout.
const VIEWPORT = { width: 1280, height: 720 };
// Messages that are expected in jsdom and say nothing about the code under test.
const EXPECTED_CONSOLE = [/Failed to load markdown parser/, /Not implemented: /];

/** The tracked file reads of the test running now, for the test cache. */
let recordRead = null;
reads.record = path => recordRead?.(path);

/** A file in a folder, or null when it is not there or the address leaves the folder. */
function fileIn(root, pathname) {
    const file = normalize(join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(normalize(root).replace(/[\\/]+$/, '') + sep)) return null;
    return existsSync(file) && statSync(file).isFile() ? file : null;
}

// Framework files not downloaded before the run, such as the shared pages in d/, are downloaded the first time a page
// asks for them, and kept beside the others so the test cache can read them.
const downloads = new Map();
async function downloadLiveCdn(pathname) {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(`${LIVE_CDN_ORIGIN}${pathname}`, { signal: AbortSignal.timeout(15000) });
            if (response.status < 500 || attempt === 4) {
                const body = Buffer.from(await response.arrayBuffer());
                if (response.status === 200) {
                    const file = normalize(join(LIVE_CDN_CACHE, decodeURIComponent(pathname)));
                    if (file.startsWith(LIVE_CDN_CACHE + sep)) {
                        mkdirSync(dirname(file), { recursive: true });
                        writeFileSync(file, body);
                    }
                }
                return { status: response.status, type: response.headers.get('content-type'), body };
            }
        } catch (error) {
            if (attempt === 4) throw new Error(`Could not download ${LIVE_CDN_ORIGIN}${pathname}: ${error.message}`);
        }
        await new Promise(done => setTimeout(done, 250 * attempt));
    }
}

/** A framework file: { status, type, body }, noting the file it came from. */
async function cdnFile(pathname, record) {
    const root = LOCAL_CDN || LIVE_CDN_CACHE;
    const file = fileIn(root, pathname);
    if (file) {
        record?.(file);
        return { status: 200, type: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) };
    }
    if (LOCAL_CDN) return { status: 404, type: 'text/plain', body: Buffer.from('Not Found') };
    if (!downloads.has(pathname)) downloads.set(pathname, downloadLiveCdn(pathname).catch(error => { downloads.delete(pathname); throw error; }));
    const downloaded = await downloads.get(pathname);
    if (downloaded.status === 200) record?.(join(LIVE_CDN_CACHE, decodeURIComponent(pathname)));
    return downloaded;
}

// The loader imports Web UI's markdown parser with import(), which a jsdom script cannot do. The harness loads the same
// file in Node and gives the page its parser at the moment the loader reports the import failed, before anything renders.
let markdownParser;
function loadMarkdownParser(record) {
    markdownParser ??= cdnFile('/js/mdparse.min.js')
        .then(file => import(`data:text/javascript;base64,${file.body.toString('base64')}`))
        .then(module => module.MarkdownParser);
    // Every page uses it, so every test depends on it.
    cdnFile('/js/mdparse.min.js', record).catch(() => { });
    return markdownParser;
}

/** What the site's server answers for an address, noting each file it reads. */
async function siteResponse(url, record) {
    const parsed = new URL(url);
    const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true' };
    // Tests replace this default with page.route when they need a specific API response.
    if (parsed.hostname === 'api.myfi.ws') return new Response('0', { headers: { 'content-type': 'text/plain', ...cors } });
    if (CDN_ORIGINS.has(parsed.origin)) {
        const file = await cdnFile(parsed.pathname, record);
        return new Response(file.body, { status: file.status, headers: { 'content-type': file.type || 'application/octet-stream', ...cors } });
    }
    // Analytics, embeds, and other outside requests fail, so tests never count as real visits.
    if (parsed.origin !== ORIGIN) return Response.error();
    const html = route => {
        // servedHtml reads through tracked-fs, which notes its files.
        return new Response(servedHtml(route), { headers: { 'content-type': 'text/html' } });
    };
    if (parsed.pathname === '/' || parsed.pathname === '/index.html') return html('/');
    const file = resolveSiteFile(parsed.pathname);
    if (file) return new Response(readFileSync(file), { headers: { 'content-type': MIME[extname(file)] || 'application/octet-stream', ...cors } });
    if (extname(parsed.pathname)) return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
    // Page addresses get their prerendered page, or the home page, as the deployed site serves them.
    return html(parsed.pathname);
}

function globMatches(pattern, url) {
    if (typeof pattern === 'function') return pattern(new URL(url));
    if (pattern instanceof RegExp) return pattern.test(url);
    const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);
    return regex.test(url);
}

/** A request as page.route handlers and page.on('request') listeners see it. */
class RouteRequest {
    constructor(url, method = 'GET', body = null, headers = {}) {
        this._url = url;
        this._method = method.toUpperCase();
        this._body = body;
        this._headers = headers;
    }
    url() { return this._url; }
    method() { return this._method; }
    headers() { return { ...this._headers }; }
    allHeaders() { return Promise.resolve(this.headers()); }
    headerValue(name) { return Promise.resolve(this._headers[name.toLowerCase()] ?? null); }
    postData() { return this._body; }
    postDataJSON() { return this._body == null ? null : JSON.parse(this._body); }
}

/** The headers of a fetch, as a plain object with lower-case names. */
function headerObject(headers) {
    const result = {};
    if (!headers) return result;
    const entries = typeof headers.forEach === 'function' && !Array.isArray(headers)
        ? (() => { const list = []; headers.forEach((value, key) => list.push([key, value])); return list; })()
        : Array.isArray(headers) ? headers : Object.entries(headers);
    for (const [key, value] of entries) result[key.toLowerCase()] = `${value}`;
    return result;
}

/** A fetch body as the text a server would receive, adding the content type a browser would for it. */
async function serializeBody(window, body, headers) {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof window.URLSearchParams) {
        headers['content-type'] ??= 'application/x-www-form-urlencoded;charset=UTF-8';
        return body.toString();
    }
    if (body instanceof window.FormData) {
        const form = new FormData();
        for (const [key, value] of body) {
            if (typeof value === 'string') form.append(key, value);
            else form.append(key, new Blob([await value.arrayBuffer()], { type: value.type }), value.name);
        }
        const request = new Request('http://localhost/', { method: 'POST', body: form });
        headers['content-type'] = request.headers.get('content-type');
        return await request.text();
    }
    if (body instanceof window.Blob) {
        if (body.type) headers['content-type'] ??= body.type;
        return Buffer.from(await body.arrayBuffer()).toString('latin1');
    }
    if (body instanceof window.ArrayBuffer || ArrayBuffer.isView(body)) return Buffer.from(body.buffer ?? body).toString('latin1');
    return `${body}`;
}

/** Answers a request through the test's routes, newest first, as Playwright does, then as the site's server would. */
async function answer(env, request) {
    env.emit('request', request);
    for (const route of [...env.routes].reverse()) {
        if (!globMatches(route.pattern, request.url())) continue;
        let result = null;
        await route.handler({
            request: () => request,
            fulfill: async ({ status = 200, contentType, body = '', json, headers = {} } = {}) => {
                const content = json !== undefined ? JSON.stringify(json) : body;
                result = new Response(status === 204 || status === 304 ? null : content, { status, headers: { 'content-type': contentType || (json !== undefined ? 'application/json' : 'text/plain'), ...headers } });
            },
            abort: async () => { result = Response.error(); },
            continue: async () => { result = 'continue'; },
            fallback: async () => { result = 'fallback'; },
        });
        if (result === 'fallback' || result === null) continue;
        if (result === 'continue') break;
        return result;
    }
    return siteResponse(request.url(), env.record);
}

/** A copy of a window's local and session storage, to carry into the page loaded after it on the same origin. */
function storageOf(window) {
    const copy = store => Object.fromEntries(Array.from({ length: store.length }, (_, i) => store.key(i)).map(key => [key, store.getItem(key)]));
    return { local: copy(window.localStorage), session: copy(window.sessionStorage) };
}

function restoreStorage(window, storage) {
    for (const [key, value] of Object.entries(storage.local)) window.localStorage.setItem(key, value);
    for (const [key, value] of Object.entries(storage.session)) window.sessionStorage.setItem(key, value);
}

/** Windows that were closed, by a page load or the test ending: they draw no more frames. */
const closedWindows = new WeakSet();
function closeWindow(window) {
    if (!window) return;
    closedWindows.add(window);
    window.close();
}

/** Lets the page act on what just happened: queued work, then two animation frames, or until the page is left. */
export async function settle(window) {
    await new Promise(done => setTimeout(done, 0));
    await new Promise(done => {
        if (closedWindows.has(window)) return done();
        const left = setInterval(() => {
            if (closedWindows.has(window)) { clearInterval(left); done(); }
        }, 10);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => { clearInterval(left); done(); }));
    });
}

/**
 * A tab: a window that starts blank, as a new Playwright page does, and loads pages with goto and reload. Routes,
 * listeners, init scripts and exposed functions carry over every load, and so does the origin's storage.
 */
export async function openTab(record) {
    const errors = [];
    const listeners = {};
    const env = {
        // jsdom has no IndexedDB: each tab gets its own, kept across its page loads, as a browser keeps the origin's.
        indexedDB: new IDBFactory(),
        routes: [],
        initScripts: [],
        exposed: {},
        errors,
        record,
        emit(event, value) { (listeners[event] || []).forEach(listener => listener(value)); },
        on(event, listener) { (listeners[event] ||= []).push(listener); },
        route(pattern, handler) { env.routes.push({ pattern, handler }); },
        waitForEvent(event, predicate = () => true) {
            return new Promise(done => env.on(event, value => { if (predicate(value)) done(value); }));
        },
        async reload() { await env.goto(env.window.location.href); },
        async goto(target) {
            const current = env.window?.location.href?.startsWith('http') ? env.window.location.href : null;
            const next = new URL(target, current || `${ORIGIN}/`);
            const storage = current && new URL(current).origin === next.origin ? storageOf(env.window) : null;
            const response = await answer(env, new RouteRequest(next.href));
            await load(await response.text(), next.href, storage);
        },
    };
    const MarkdownParser = await loadMarkdownParser(record);
    const consoleMessage = (type, args) => ({ type: () => (type === 'warn' ? 'warning' : type), text: () => args.map(arg => arg?.stack || `${arg}`).join(' '), args: () => args });
    const report = error => {
        const text = error?.stack || `${error}`;
        if (!EXPECTED_CONSOLE.some(pattern => pattern.test(text))) errors.push(text);
    };
    const load = async (pageHtml, pageUrl, storage) => {
        closeWindow(env.window);
        const virtualConsole = new VirtualConsole();
        for (const type of ['log', 'info', 'warn', 'debug']) virtualConsole.on(type, (...args) => env.emit('console', consoleMessage(type, args)));
        virtualConsole.on('error', (...args) => {
            const text = args.map(arg => `${arg}`).join(' ');
            // The loader failed to import the parser, and is about to say it has loaded: the real one goes in first.
            // webui is a top-level const of the loader's script, not a property of the window.
            const webui = text.startsWith('Failed to load markdown parser') && env.window?.eval('typeof webui === "object" ? webui : null');
            if (webui) webui.markdown = new MarkdownParser();
            env.emit('console', consoleMessage('error', args));
            // Only messages about setting data, which mean a broken binding, fail a test, as in the browser harness.
            if (text.startsWith('Error setting data')) errors.push(text);
        });
        virtualConsole.on('jsdomError', error => {
            // A file from outside the site and the CDN, such as fonts or analytics, is blocked on purpose.
            const failed = `${error.message}`.match(/^Could not load \w+: "([^"]+)"/)?.[1];
            if (failed && !CDN_ORIGINS.has(new URL(failed).origin) && new URL(failed).origin !== ORIGIN) return;
            if (!EXPECTED_CONSOLE.some(pattern => pattern.test(`${error.message}`))) env.emit('pageerror', error);
        });
        const dom = new JSDOM(pageHtml, {
            url: pageUrl,
            runScripts: 'dangerously',
            pretendToBeVisual: true,
            virtualConsole,
            resources: {
                interceptors: [requestInterceptor(async request => {
                    const response = await answer(env, new RouteRequest(request.url, request.method, null, headerObject(request.headers)));
                    // jsdom stops reading the page at a stylesheet whose request fails outright, where a browser goes on,
                    // so a blocked file fails with an error status instead.
                    return response.type === 'error' ? new Response('', { status: 502 }) : response;
                })],
            },
            beforeParse(window) {
                // A page leaving for another loads it in this tab, after the current task, as a browser does.
                Object.defineProperty(window, '__leaveTo', {
                    value: href => setTimeout(() => {
                        if (env.window === window) env.goto(href).catch(error => env.emit('pageerror', error));
                    }, 0),
                });
                env.page?.clock?._onWindow(window);
                Object.defineProperty(window, 'innerWidth', { configurable: true, value: env.viewport?.width ?? VIEWPORT.width });
                Object.defineProperty(window, 'innerHeight', { configurable: true, value: env.viewport?.height ?? VIEWPORT.height });
                if (storage) restoreStorage(window, storage);
                installStandIns(window);
                Object.assign(window, { IDBCursor, IDBCursorWithValue, IDBDatabase, IDBIndex, IDBKeyRange, IDBObjectStore, IDBOpenDBRequest, IDBRequest, IDBTransaction, IDBVersionChangeEvent, IDBFactory });
                Object.defineProperty(window, 'indexedDB', { configurable: true, value: env.indexedDB });
                // jsdom's crypto has getRandomValues only; Node's Web Crypto stands in for the rest.
                if (!window.crypto?.subtle) Object.defineProperty(window, 'crypto', { configurable: true, value: globalThis.crypto });
                window.matchMedia = mediaMatcher(env.media);
                window.fetch = async (input, init = {}) => {
                    // Relative to the document's base address, as a browser's fetch is, not the page's.
                    const target = new URL(typeof input === 'string' ? input : input.url ?? `${input}`, window.document.baseURI).href;
                    const headers = headerObject(init.headers ?? input?.headers);
                    const body = await serializeBody(window, init.body ?? null, headers);
                    const response = await answer(env, new RouteRequest(target, init.method || input?.method || 'GET', body, headers));
                    if (response.type === 'error') throw new window.TypeError('Failed to fetch');
                    return pageResponse(window, response);
                };
                window.Response ??= Response;
                window.Request ??= Request;
                window.Headers ??= Headers;
                const attach = window.HTMLElement.prototype.attachInternals;
                window.HTMLElement.prototype.attachInternals = function () {
                    const internals = attach.call(this);
                    const host = this;
                    internals.setFormValue ??= value => { host.__formValue = value; };
                    internals.setValidity ??= () => { };
                    // jsdom does not associate custom elements with their form, so the form is the one they sit in.
                    const nativeForm = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(internals), 'form')?.get;
                    Object.defineProperty(internals, 'form', { configurable: true, get: () => nativeForm?.call(internals) || host.closest('form') });
                    return internals;
                };
                // The loader handles window errors itself, so they are reported from here, as in the browser harness.
                window.addEventListener('error', event => {
                    if (/ResizeObserver loop/.test(event.message)) return;
                    env.emit('pageerror', event.error || new Error(event.message));
                    report(event.error || event.message);
                });
                window.addEventListener('unhandledrejection', event => {
                    const reason = event.reason;
                    if (reason instanceof window.TypeError && reason.message === 'Failed to fetch') return;
                    if (reason instanceof window.TypeError || reason instanceof window.ReferenceError || reason instanceof window.SyntaxError) report(reason);
                });
                for (const [name, fn] of Object.entries(env.exposed)) window[name] = async (...args) => fn(...args);
                for (const { source, arg } of env.initScripts) window.eval(`(${source})(${arg === undefined ? '' : JSON.stringify(arg)})`);
            },
        });
        const { window } = dom;
        Object.assign(env, { dom, window, document: window.document });
        env.page?._attach(env);
        await settle(window);
    };
    env.settle = () => settle(env.window);
    await load('<!DOCTYPE html><html><head></head><body></body></html>', 'about:blank', null);
    return env;
}

/**
 * Vitest's `test` with Playwright's `page` fixture: a fresh tab per test, which fails the test on uncaught errors.
 *
 * A test with a page is skipped when it passed before and nothing it depends on has changed (test-cache.mjs): its test
 * file, the harness, and every file it read, through its page or the site helpers.
 */
export const test = base.extend({
    baseURL: async ({}, use) => use(ORIGIN),
    page: async ({ task, skip, onTestFinished }, use) => {
        const cache = cacheFor(task.file.filepath);
        const name = testName(task);
        if (cache.isFresh(name)) skip('passed before, and nothing it depends on has changed');
        const files = new Set();
        const record = file => {
            const path = fromRoot(resolve(file));
            if (!path.startsWith('node_modules/') || path.startsWith('node_modules/.cache/live-cdn/')) files.add(path);
        };
        onTestFinished(({ task }) => {
            recordRead = null;
            if (task.result?.state === 'pass') cache.passed(name, [...files]);
            else cache.failed(name);
        });
        recordRead = record;
        const env = await openTab(record);
        const page = new Page(env);
        env.page = page;
        await use(page);
        page.clock?.uninstall();
        closeWindow(env.window);
        // Vitest keeps each test's context until the file ends, so the window is let go here or every test's stays.
        const { errors } = env;
        page.release();
        for (const key of Object.keys(env)) delete env[key];
        // Anything the closed window still says goes nowhere.
        Object.assign(env, { closed: true, errors: [], routes: [], initScripts: [], exposed: {}, emit() { }, on() { }, record() { } });
        expect(errors, 'Uncaught errors happened while this test ran').toEqual([]);
    },
});

// Each test file imports this harness, so this runs once its tests are done: the file's results are saved, dropping
// tests it no longer has.
afterAll(({}, file) => {
    if (file?.filepath) cacheFor(file.filepath).save(allTestNames(file.tasks));
});

/**
 * Open a page of the site and wait until it is ready: the loader has put the page's content in place and finished
 * its fade, every component on the page is defined, and the content in view has loaded.
 */
export async function openPage(page, route) {
    await page.goto(route);
    await pageReady(page);
    return page;
}

/** As tests/support/site.mjs's pageReady: waits for a page the loader is loading, or has loaded, to be ready. */
export async function pageReady(page) {
    await page.waitForFunction(() => {
        if (typeof webui !== 'object' || !webui.loaded || !webui.appConfig?.appName) return false;
        const app = document.querySelector('webui-app');
        if (!app?.main || app.main.classList.contains('transition')) return false;
        return !!webui.getData('page-title') || !!document.querySelector('webui-page-not-found');
    });
    await expect.poll(() => unfinishedLoading(page), { message: 'The page never finished loading these' }).toEqual([]);
    return page;
}

/** What a page is still loading: components without a definition, and webui-content in view that has not shown yet. */
export async function unfinishedLoading(page) {
    return page.evaluate(() => {
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
        return elements.filter(el => el.localName === 'webui-content')
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

/**
 * Signs the page in as a test user with the given roles (see pageRoles) by answering the site's rolesApi.
 * Call it before the page opens. Nothing reaches a real account: every other API request still gets the default answer.
 */
export async function signIn(page, roles) {
    const config = readJson(join(ROOT_FILES, 'appConfig.json'));
    if (!config.appApi || !config.rolesApi) throw new Error('appConfig.json needs appApi and rolesApi to sign in');
    const rolesUrl = new URL(config.rolesApi, config.appApi.replace(/\/?$/, '/'));
    await page.route(url => url.origin === rolesUrl.origin && url.pathname === rolesUrl.pathname, route => route.fulfill({
        headers: { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true' },
        contentType: 'text/plain',
        body: String(roles),
    }));
}

/** Waits until the page has loaded the signed-in user's roles. */
export async function expectSignedIn(page, roles) {
    await expect.poll(() => page.evaluate(() => webui.getData('session-user-role')), { message: 'The test user never signed in' }).toBe(roles);
}

/** Put HTML on the page and wait for the components in it to load. Returns a locator for the container. */
export async function mount(page, html) {
    const { window, document } = page;
    let root = document.getElementById('test-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'test-root';
        document.body.appendChild(root);
    }
    root.innerHTML = html;
    const tags = [...new Set((html.match(/<(webui|app)-[a-z0-9-]+/g) || []).map(tag => tag.substring(1)))];
    await Promise.all(tags.map(tag => window.customElements.whenDefined(tag)));
    await page.settle();
    return new Locator(page, () => [document.getElementById('test-root')].filter(Boolean), '#test-root');
}
