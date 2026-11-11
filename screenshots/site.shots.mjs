import { test, expect, ROOT_FILES } from '../tests/support/site.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addSampleData } from './sample-data.mjs';

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
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
}

// Double resolution, so the text in the pictures stays sharp when a page shows them smaller than the app.
test.use({ deviceScaleFactor: 2 });

test('screenshots for the public pages', async ({ page }) => {
    test.setTimeout(180000);
    mkdirSync(OUT, { recursive: true });
    await page.clock.setFixedTime(new Date('2026-11-02T15:00:00Z'));
    await page.setViewportSize({ width: 1280, height: 800 });
    await test.step('add sample data', () => addSampleData(page));

    await test.step('dashboard', async () => {
        const dashboard = page.locator('app-dashboard');
        for (const name of ['Problems', 'Solutions', 'Tasks']) await dashboard.getByRole('button', { name, exact: true }).click();
        await expect(dashboard.locator('app-item-manager')).toHaveCount(3);
        await expect(dashboard.locator('app-item-manager[type="problem"] app-sortable-list').getByRole('button', { name: 'Checkout Timeouts' })).toBeVisible();
        // Start at the manager toggles, so the picture shows the lists rather than the tag filter above them.
        await dashboard.getByRole('button', { name: 'Tasks', exact: true }).evaluate(el => el.closest('webui-paper').scrollIntoView({ block: 'start' }));
        await settle(page);
        await page.screenshot({ path: join(OUT, 'dashboard.png') });
    });

    await test.step('problem', async () => {
        await open(page, '/problems');
        const manager = page.locator('app-item-manager');
        await manager.locator('app-sortable-list').getByRole('button', { name: 'Checkout Timeouts' }).click();
        await expect(manager).toContainText('Problem: Checkout Timeouts');
        await manager.locator('webui-switch').getByRole('radio', { name: 'Both' }).click();
        await settle(page);
        await manager.screenshot({ path: join(OUT, 'problem.png') });
    });

    await test.step('solutions', async () => {
        await page.evaluate(() => window.taskStory.filter.set(['problem:checkouttimeouts']));
        await open(page, '/solutions');
        const manager = page.locator('app-item-manager');
        await expect(manager.locator('app-sortable-list').getByRole('button')).toHaveCount(3);
        await expect(manager).toContainText('Solution: Cache Cart Totals');
        await settle(page);
        await manager.screenshot({ path: join(OUT, 'solutions.png') });
        await page.evaluate(() => window.taskStory.filter.set([]));
    });

    await test.step('publish', async () => {
        await open(page, '/problems');
        const manager = page.locator('app-item-manager');
        await manager.locator('app-sortable-list').getByRole('button', { name: 'Checkout Timeouts' }).click();
        await manager.getByRole('button', { name: 'Publish' }).click();
        const publisher = page.locator('app-story-publisher');
        await expect(publisher).toContainText('Upgrade Payment SDK');
        await publisher.getByRole('button', { name: 'Upgrade Payment SDK: Implemented. Toggle' }).click();
        await publisher.getByRole('button', { name: 'Queue Tax Lookups: Implemented. Toggle' }).click();
        // Start at the solutions, where each is marked as implemented or dropped.
        await publisher.getByRole('button', { name: 'Cache Cart Totals: Implemented. Toggle' }).evaluate(el => el.scrollIntoView({ block: 'start' }));
        await settle(page);
        await page.screenshot({ path: join(OUT, 'publish.png') });
        await page.keyboard.press('Escape');
    });

    await test.step('story', async () => {
        await open(page, '/stories');
        const manager = page.locator('app-item-manager');
        await expect(manager).toContainText('Login Emails Arrive Late');
        await expect(manager).toContainText('Send From Background Job');
        await manager.scrollIntoViewIfNeeded();
        await manager.evaluate(el => el.scrollIntoView({ block: 'start' }));
        await settle(page);
        // A story is long, so keep its top: the title, tags, and the start of the problem.
        const box = await manager.boundingBox();
        await page.screenshot({ path: join(OUT, 'story.png'), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 720) } });
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
