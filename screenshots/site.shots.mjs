import { test, expect, ROOT_FILES } from '../tests/support/site.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dashboardPicture, pictureReady, stillPicture } from './sample-data.mjs';

// Captures the screenshots used on the public pages. Run it with PowerShell/screenshots.ps1 (Publish.ps1 does).
// The app runs against the simulated API with sample data for one team, at a fixed date, so the images only change
// when the UI does. The images go to webapp/root_files/img, which the site serves at /img.
const OUT = join(ROOT_FILES, 'img', 'screenshots');
const SHARE = join(ROOT_FILES, 'img', 'share.png');

async function open(page, route) {
    await page.goto(route);
    await expect(page.locator('app-workspace')).toContainText('Signed in as Alex');
}

async function settle(page) {
    // Keep hover tooltips out of the pictures.
    await page.mouse.move(0, 0);
    await pictureReady(page);
}

// Double resolution, so the text in the pictures stays sharp when a page shows them smaller than the app.
test.use({ deviceScaleFactor: 2 });

test('screenshots for the public pages', async ({ page }) => {
    test.setTimeout(180000);
    mkdirSync(OUT, { recursive: true });
    await page.clock.setFixedTime(new Date('2026-11-02T15:00:00Z'));
    await page.setViewportSize({ width: 1280, height: 800 });
    // Adds the sample data too. The home page's own screenshot takes this picture again for itself (pages.setup.mjs),
    // so it never depends on whether this file has been written yet.
    await test.step('dashboard', async () => {
        writeFileSync(join(OUT, 'dashboard.png'), await dashboardPicture(page));
    });

    await test.step('problem', async () => {
        await open(page, '/problems');
        const manager = page.locator('app-item-manager');
        await manager.locator('app-sortable-list').getByRole('button', { name: 'Checkout Timeouts' }).click();
        await expect(manager).toContainText('Problem: Checkout Timeouts');
        await manager.locator('webui-switch').getByRole('radio', { name: 'Both' }).click();
        await settle(page);
        writeFileSync(join(OUT, 'problem.png'), await stillPicture(manager));
    });

    await test.step('solutions', async () => {
        await page.evaluate(() => window.taskStory.filter.set(['problem:checkouttimeouts']));
        await open(page, '/solutions');
        const manager = page.locator('app-item-manager');
        await expect(manager.locator('app-sortable-list').getByRole('button')).toHaveCount(3);
        await expect(manager).toContainText('Solution: Cache Cart Totals');
        await settle(page);
        writeFileSync(join(OUT, 'solutions.png'), await stillPicture(manager));
        await page.evaluate(() => window.taskStory.filter.set([]));
    });

    await test.step('publish', async () => {
        await open(page, '/problems');
        const manager = page.locator('app-item-manager');
        await manager.locator('app-sortable-list').getByRole('button', { name: 'Checkout Timeouts' }).click();
        await expect(manager).toContainText('Problem: Checkout Timeouts');
        // The dialog sizes its text boxes when it opens, so have the fonts in before it does.
        await pictureReady(page);
        await manager.getByRole('button', { name: 'Publish' }).click();
        const publisher = page.locator('app-story-publisher');
        await expect(publisher).toContainText('Upgrade Payment SDK');
        await publisher.getByRole('button', { name: 'Upgrade Payment SDK: Implemented. Toggle' }).click();
        await publisher.getByRole('button', { name: 'Queue Tax Lookups: Implemented. Toggle' }).click();
        // Start at the solutions, where each is marked as implemented or dropped.
        await publisher.getByRole('button', { name: 'Cache Cart Totals: Implemented. Toggle' }).evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await settle(page);
        writeFileSync(join(OUT, 'publish.png'), await stillPicture(page));
        await page.keyboard.press('Escape');
    });

    await test.step('story', async () => {
        await open(page, '/stories');
        const manager = page.locator('app-item-manager');
        await expect(manager).toContainText('Login Emails Arrive Late');
        await expect(manager).toContainText('Send From Background Job');
        await manager.scrollIntoViewIfNeeded();
        await manager.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await settle(page);
        // A story is long, so keep its top: the title, tags, and the start of the problem.
        const box = await manager.boundingBox();
        writeFileSync(join(OUT, 'story.png'), await stillPicture(page, { clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 720) } }));
    });

    await test.step('share image', async () => {
        // A standalone 1200x630 card for link previews: the pitch beside the dashboard screenshot, in the brand colors.
        const dashboard = readFileSync(join(OUT, 'dashboard.png')).toString('base64');
        await page.setViewportSize({ width: 1200, height: 630 });
        await page.setContent(`<!doctype html><html><head><style>
            html, body { margin:0; width:1200px; height:630px; overflow:hidden; background:#333333; color:#ffffff; font-family:system-ui, 'Segoe UI', sans-serif; }
            main { box-sizing:border-box; width:100%; height:100%; display:grid; grid-template-columns:470px 1fr; gap:40px; align-items:center; padding:56px; border-top:12px solid #c1570b; }
            .brand { font-size:30px; font-weight:800; color:#cd4c06; letter-spacing:0.02em; margin:0 0 24px 0; }
            h1 { font-size:54px; line-height:1.08; margin:0 0 24px 0; }
            p { font-size:24px; line-height:1.4; margin:0; color:#e6e6e6; }
            img { width:100%; border-radius:8px; box-shadow:0 12px 40px rgba(0, 0, 0, 0.6); border:1px solid #555555; }
        </style></head><body><main><div><div class="brand">Task Story</div><h1>Track the problem, not just the ticket.</h1>
            <p>Project management for software teams that ship in short, continuous iterations.</p></div>
            <img alt="" src="data:image/png;base64,${dashboard}"></main></body></html>`);
        await page.evaluate(() => document.fonts.ready);
        // Link previews need exactly 1200x630, so this one is taken at page size.
        await page.screenshot({ path: SHARE, scale: 'css' });
    });
});
