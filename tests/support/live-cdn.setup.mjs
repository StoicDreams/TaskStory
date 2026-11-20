import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Downloads the framework files from cdn.myfi.ws once per test run, before any test worker starts, into
// node_modules/.cache/live-cdn. Workers serve them from there (serveLiveCdn in site.mjs), so no test waits on the
// network for them. When each worker downloaded them itself, a busy machine made those downloads stall past their
// time limit, and tests failed waiting for the loader or a component. Files not listed here, such as the shared pages
// in d/, are still downloaded by a worker the first time a page asks for them.
// This file is the same in every site. playwright.config.mjs and vitest.config.mjs run it as globalSetup.

const LIVE_CDN_ORIGIN = 'https://cdn.myfi.ws';
export const LIVE_CDN_CACHE = fileURLToPath(new URL('../../node_modules/.cache/live-cdn', import.meta.url));
const ATTEMPTS = 4;
const TIMEOUT = 15000;
const AT_ONCE = 16;

async function download(path) {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(`${LIVE_CDN_ORIGIN}/${path}`, { signal: AbortSignal.timeout(TIMEOUT) });
            if (response.status < 500 || attempt === ATTEMPTS) {
                return { status: response.status, contentType: response.headers.get('content-type'), body: Buffer.from(await response.arrayBuffer()) };
            }
        } catch (error) {
            if (attempt === ATTEMPTS) return null;
        }
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
}

function save(path, file) {
    const target = join(LIVE_CDN_CACHE, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.body);
    return { status: file.status, contentType: file.contentType };
}

export default async function globalSetup() {
    // The local-cdn project, and the unit tests' local-cdn mode (WEBUI_CDN_ROOT), serve the framework from a MyFiCDN
    // checkout, so they need nothing from the live CDN.
    const args = process.argv.join(' ');
    if (/--project[= ]local-cdn\b/.test(args) && !/--project[= ](?!local-cdn\b)/.test(args)) return;
    if (process.env.WEBUI_CDN_ROOT) return;
    rmSync(LIVE_CDN_CACHE, { recursive: true, force: true });
    const index = {};
    const lists = {};
    for (const path of ['webui/components.json', 'icons/all.json']) {
        const file = await download(path);
        if (!file || file.status !== 200) continue;
        index[path] = save(path, file);
        try { lists[path] = JSON.parse(file.body.toString('utf8').replace(/^﻿/, '')); } catch { }
    }
    const paths = ['css/webui.min.css', 'webui/loader.min.js', 'js/mdparse.min.js', 'roles.json'];
    for (const name of lists['webui/components.json'] || []) {
        if (typeof name === 'string' && name.startsWith('webui-')) paths.push(`webui/${name.slice('webui-'.length)}.min.js`);
    }
    for (const icon of lists['icons/all.json'] || []) {
        if (typeof icon?.name === 'string') paths.push(`icons/${icon.name}.webui`);
    }
    let next = 0;
    await Promise.all(Array.from({ length: AT_ONCE }, async () => {
        while (next < paths.length) {
            const path = paths[next++];
            const file = await download(path);
            if (file) index[path] = save(path, file);
        }
    }));
    writeFileSync(join(LIVE_CDN_CACHE, 'index.json'), JSON.stringify(index));
    // Workers get the environment global setup leaves, so only this run's workers use this run's files.
    process.env.LIVE_CDN_CACHE = LIVE_CDN_CACHE;
}
