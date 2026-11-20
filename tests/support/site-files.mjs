import { createHash } from 'node:crypto';
import { join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync, statSync } from './tracked-fs.mjs';

// What a site is made of, read from its files: its pages, routes, navigation, prerendered pages, and theme. Plain Node,
// used by both test tiers and the screenshots. This file is the same in every site: change them all at once.

// Serves the site straight from webapp/, laid out the way Trunk copies it into dist/, so tests need no build or server.
export const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const WEBAPP = join(SITE_ROOT, 'webapp');
export const ROOT_FILES = join(WEBAPP, 'root_files');
export const PAGES = join(WEBAPP, 'd');
// The prerendered pages, written by `webapp_post_build prerender` and committed. Release builds serve them from the site root.
export const PRERENDERED = join(WEBAPP, 'pages');


export const MIME = {
    '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.gif': 'image/gif', '.wasm': 'application/wasm',
    '.md': 'text/plain', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
};

export function readText(file) {
    return readFileSync(file, 'utf8');
}

export function readJson(file) {
    return JSON.parse(readText(file).replace(/^﻿/, ''));
}

export function inside(root, pathname) {
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
export function appShell() {
    return readText(join(WEBAPP, 'index.html'))
        .replace(/<link\b[^>]*\bdata-trunk\b[^>]*>/g, tag => {
            const href = tag.match(/href="([^"]+)"/)?.[1];
            return /rel="css"/.test(tag) && href ? `<link href="${href}" rel="stylesheet" />` : '';
        })
        .replace(/<script\b([^>]*)\bdata-trunk\b/g, '<script$1');
}

/**
 * The prerendered file in webapp/pages for a route, or null. IIS serves /about from about.html, and the home page
 * and every address without a file of its own from index.html, which a release build replaces with pages/index.html.
 */
export function prerenderedFile(route) {
    const path = route.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    return inside(PRERENDERED, path === '' || path === '/index.html' ? 'index.html' : `${path}.html`);
}

/** The HTML the deployed site serves for an address: its prerendered page, or the app shell. */
export function servedHtml(pathname) {
    const file = prerenderedFile(pathname) || prerenderedFile('/');
    return file ? readText(file) : appShell();
}

/**
 * The version webapp_post_build writes for files, in the ?v= of links and the webui-prerender meta tag: the first 10
 * hex digits of a SHA-256 of the files joined by a zero byte, with Windows line endings read as Unix ones.
 */
export function sourceVersion(...files) {
    const hash = createHash('sha256');
    files.forEach((bytes, index) => {
        if (index) hash.update(Buffer.from([0]));
        hash.update(Buffer.from(Buffer.from(bytes).toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
    });
    return hash.digest('hex').slice(0, 10);
}

/** The route of a markdown file under webapp/d. d/root.md is "/". */
export function fileToRoute(file) {
    const path = relative(PAGES, file).split(sep).join('/').replace(/\.md$/, '').toLowerCase();
    return path === 'root' ? '/' : `/${path}`;
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

/** The pages to open in tests and screenshots: every linked route except dynamic routes and plain files. */
export function pageRoutes() {
    return siteRoutes().filter(route => !isDynamicRoute(route) && !resolveSiteFile(route));
}

/** The pages screenshots/pages.shots.mjs captures: every page in nav.json, the site's main navigation. */
export function screenshotRoutes() {
    return [...new Set(navRoutes()
        .filter(route => route.startsWith('/') && !route.startsWith('//'))
        .map(route => route.replace(/[?#].*$/, '') || '/'))]
        .filter(route => !isDynamicRoute(route) && !resolveSiteFile(route))
        .sort();
}

/** The nav.json item for a route, including nested children. */
function navItem(route) {
    const find = items => {
        for (const item of items || []) {
            if (typeof item.url === 'string' && (item.url.replace(/[?#].*$/, '') || '/') === route) return item;
            const child = find(item.children);
            if (child) return child;
        }
        return null;
    };
    return find(readJson(join(ROOT_FILES, 'nav.json')));
}

/**
 * The roles a visitor needs to see a page's content, as one role number for signIn, or 0 for a guest.
 * A page needs sign-in when its nav.json item has a role above 0, or when all of its content is inside one
 * webui-restrict-to-role. Then the user also gets the role of every webui-restrict-to-role on the page (except
 * role 0, which is for guests only), so everything a signed-in visitor could see shows. -1 is every role.
 */
export function pageRoles(route) {
    const file = routeToFile(route);
    const text = existsSync(file) ? readText(file) : '';
    const content = text.replace(/<webui-data\b[^>]*>\s*<\/webui-data>/g, '').trim();
    const navRole = parseInt(navItem(route)?.role) || 0;
    const allRestricted = /^<webui-restrict-to-role\b/.test(content) && /<\/webui-restrict-to-role>$/.test(content);
    if (navRole === 0 && !allRestricted) return 0;
    const roles = [navRole, ...[...text.matchAll(/<webui-restrict-to-role\b[^>]*\brole="(-?\d+)"/g)].map(match => parseInt(match[1]))];
    if (roles.includes(-1)) return -1;
    return roles.reduce((all, role) => all | role, 1);
}

/** Where screenshots/pages.shots.mjs saves a page's screenshot. "/" is root.png, like d/root.md. */
export const PAGE_SCREENSHOTS = join(ROOT_FILES, 'img', 'screenshots', 'pages');
export function pageScreenshotFile(route) {
    const path = route.replace(/^\/+|\/+$/g, '').toLowerCase();
    return join(PAGE_SCREENSHOTS, `${path || 'root'}.png`);
}

export function relativeToSite(file) {
    return relative(SITE_ROOT, file).split(sep).join('/');
}

/** The custom properties set in a stylesheet's :root block. */
export function themeVariables(css) {
    const block = css.match(/:root\s*\{([\s\S]*?)\}/);
    const vars = {};
    // Minified CSS leaves out the last semicolon, so a declaration can also end the block.
    if (block) for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) vars[m[1]] = m[2].trim();
    return vars;
}

/** A theme value in one standard form, so a minifier writing #fff for #FFFFFF still matches. */
export function normalizeThemeValue(value) {
    const color = colorToRgb(value.trim());
    if (color) return `rgba(${color.rgb.join(',')},${+color.alpha.toFixed(3)})`;
    // Minifiers shorten numbers (0.01em becomes .01em, 1.50 becomes 1.5), so numbers compare by value.
    return value.replace(/(?<![\w#.])(\d*\.\d+|\d+)/g, n => String(+n)).replace(/\s+/g, '').toLowerCase();
}

function colorToRgb(value) {
    let m = value.match(/^#([0-9a-f]{3})$/i);
    if (m) return { rgb: [...m[1]].map(c => parseInt(c + c, 16)), alpha: 1 };
    m = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) return { rgb: [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)), alpha: m[2] ? parseInt(m[2], 16) / 255 : 1 };
    m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) return { rgb: m.slice(1, 4).map(Number), alpha: m[4] === undefined ? 1 : parseFloat(m[4]) };
    return null;
}

/** WCAG contrast ratio between two colors given as [r, g, b]. */
export function contrastRatio(a, b) {
    const lum = rgb => {
        const c = rgb.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

/**
 * Theme colors in webapp/css/app.css whose -offset text color is under 4.5:1 against them, the WCAG AA level
 * for normal text. Colors that are see-through, or that this file cannot resolve on its own, are skipped.
 */
export function themeContrastProblems() {
    const file = join(WEBAPP, 'css', 'app.css');
    if (!existsSync(file)) return [];
    const vars = themeVariables(readFileSync(file, 'utf8'));
    const resolve = (value, depth = 0) => {
        const m = value && value.match(/^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/);
        if (!m) return value;
        return depth > 10 ? null : resolve(vars[m[1]] ?? m[2], depth + 1);
    };
    const problems = [];
    for (const key of Object.keys(vars).filter(k => k.startsWith('--color-') && !k.endsWith('-offset'))) {
        if (!vars[`${key}-offset`]) continue;
        const bg = colorToRgb(resolve(vars[key]) || ''), fg = colorToRgb(resolve(vars[`${key}-offset`]) || '');
        if (!bg || !fg || bg.alpha < 1) continue;
        const ratio = contrastRatio(bg.rgb, fg.rgb);
        if (ratio < 4.5) problems.push(`${key} (${vars[key]}) with ${key}-offset: ${ratio.toFixed(2)}:1`);
    }
    return problems;
}
