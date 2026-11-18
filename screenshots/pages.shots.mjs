import { test, openPage, pageReady, screenshotRoutes, pageScreenshotFile, pageRoles, signIn, expectSignedIn, PAGE_SCREENSHOTS } from '../tests/support/site.mjs';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Captures one screenshot of every page in nav.json, the site's main navigation, for marketing and design reviews.
// This file is the same in every site. Run it with PowerShell/screenshots.ps1, which Publish.ps1 runs.
// Each image is saved under webapp/root_files/img/screenshots/pages, named after its route ("/" is root.png),
// and an image whose page no longer exists is deleted.
//
// A page for signed-in visitors (a nav.json role above 0, or content all inside webui-restrict-to-role) is captured
// signed in as a test user with every role the page asks for (pageRoles in tests/support/site.mjs), so the picture
// shows what those visitors see rather than the sign-in prompt.
//
// A site can set up its pages in screenshots/pages.setup.mjs, which may export:
//   setup(page, route): runs before the page opens, for example to sign in or add sample data.
//   prepare(page, route): runs after the page opens and before the screenshot, for example to open a panel.

const setupFile = join(dirname(fileURLToPath(import.meta.url)), 'pages.setup.mjs');
const site = existsSync(setupFile) ? await import(pathToFileURL(setupFile).href) : {};
const routes = screenshotRoutes();

function removeOldScreenshots() {
    const keep = new Set(routes.map(pageScreenshotFile));
    const walk = dir => {
        if (!existsSync(dir)) return;
        for (const name of readdirSync(dir)) {
            const file = join(dir, name);
            if (statSync(file).isDirectory()) walk(file);
            else if (name.endsWith('.png') && !keep.has(file)) unlinkSync(file);
        }
    };
    walk(PAGE_SCREENSHOTS);
}
removeOldScreenshots();

// Waits for everything a download or a transition can still change in the picture: fonts, icons, images, and fades.
async function pictureReady(page) {
    await page.evaluate(async () => {
        const all = (root, found = []) => {
            for (const el of root.querySelectorAll('*')) {
                found.push(el);
                if (el.shadowRoot) all(el.shadowRoot, found);
            }
            return found;
        };
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const elements = all(document);
        await document.fonts.ready;
        // Icons draw themselves once their definition has downloaded. This asks for the same cached download each
        // icon is waiting on, so when it answers, and a frame has passed, every icon has been given its drawing.
        const icons = new Set(elements.filter(el => el.localName === 'webui-icon' && el._iconRequest).map(el => el._iconRequest));
        await Promise.all([...icons].map(name => webui.fetchWithCache(`${webui.cdnRoot}icons/${name}.webui`).catch(() => { })));
        // An image that is out of view and loads lazily has not started, and will not until it is scrolled to.
        const images = elements.filter(el => el.localName === 'img' && el.currentSrc && !(el.loading === 'lazy' && !el.complete));
        await Promise.all(images.map(img => img.complete ? null : new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        })));
        // A broken image rejects decode, and still shows the same every time.
        await Promise.all(images.map(img => img.decode().catch(() => { })));
        // Transitions start when the browser next works out styles, so let two frames pass before looking for them.
        await frame();
        await frame();
        // Fades, icon morphs, and other transitions that end. A looping animation never finishes, so it is left running.
        // document.getAnimations leaves out shadow roots, where the components keep theirs, so each root is asked.
        const roots = () => [document, ...all(document).map(el => el.shadowRoot).filter(Boolean)];
        const ending = () => roots().flatMap(root => root.getAnimations()).filter(animation => animation.playState === 'running'
            && Number.isFinite(animation.effect?.getComputedTiming().endTime));
        for (let running = ending(); running.length; running = ending()) {
            await Promise.all(running.map(animation => animation.finished.catch(() => { })));
        }
        // The fonts and images above can start loading late, so check them once more now the fades are over.
        await document.fonts.ready;
        // Two frames, so the browser has painted the finished page before the picture is taken.
        await frame();
        await frame();
    });
}

// Each page starts from a fresh browser, so pages can be captured at the same time.
test.describe.configure({ mode: 'parallel' });

for (const route of routes) {
    test(`screenshot of ${route}`, async ({ page }) => {
        test.setTimeout(60000);
        // A fixed date and size, so the images only change when the UI does.
        await page.clock.setFixedTime(new Date('2026-11-02T15:00:00Z'));
        await page.setViewportSize({ width: 1280, height: 800 });
        const roles = pageRoles(route);
        if (roles !== 0) await signIn(page, roles);
        if (site.setup) await site.setup(page, route);
        await openPage(page, route);
        if (roles !== 0) await expectSignedIn(page, roles);
        if (site.prepare) await site.prepare(page, route);
        // Keep hover tooltips out of the picture: the corner is over the menu, so rest on the copyright line instead.
        await page.mouse.move(640, 798);
        // Components also wait on timers, such as a drawer's dock button working out its icon, and nothing says when
        // those are over. So move the clock past them, then wait for the downloads, content, and fades they started.
        // Twice, because content that a timer loads can start timers of its own. The date stays fixed throughout.
        for (let round = 0; round < 2; round++) {
            await page.clock.runFor(3000);
            await pageReady(page);
            await pictureReady(page);
        }
        const file = pageScreenshotFile(route);
        mkdirSync(dirname(file), { recursive: true });
        await page.screenshot({ path: file });
    });
}
