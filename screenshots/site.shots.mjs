import { test, expect, ROOT_FILES } from '../tests/support/site.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Captures the screenshots used on the public pages. Run it with PowerShell/screenshots.ps1 (Publish.ps1 does).
// The app runs against the simulated API with sample data for one team, at a fixed date, so the images only change
// when the UI does. The images go to webapp/root_files/img, which the site serves at /img.
const OUT = join(ROOT_FILES, 'img', 'screenshots');
const SHARE = join(ROOT_FILES, 'img', 'share.png');

const sample = {
    projects: [
        { name: 'Customer Portal', tags: [], summary: 'The web portal where customers place and track orders.' },
        { name: 'Mobile App', tags: [], summary: 'The iOS and Android apps for repeat customers.' },
    ],
    features: [
        { name: 'Saved Carts', tags: ['project:customerportal'], summary: 'Let customers save a cart and come back to it later.' },
    ],
    problem: {
        name: 'Checkout Timeouts', tags: ['project:customerportal', 'bug'],
        summary: 'Checkout sometimes takes more than 30 seconds and times out, so **customers abandon their orders**.',
        who: 'Customers with large carts, mostly business accounts.',
        what: 'The checkout request times out before the order is placed.',
        where: 'The final step of checkout in the customer portal.',
        when: 'During weekday mornings, when order volume peaks.',
        why: 'Each timeout is a lost or duplicated order, and support has to sort it out by hand.',
        how: '1. Add 40 or more items to a cart.\n2. Check out between 9 and 11 AM.\n3. Watch the request in the browser tools.',
    },
    solutions: [
        { name: 'Cache Cart Totals', summary: 'Work out the totals as the cart changes, so checkout only confirms them.', investigation: 'Totals take about 70% of the checkout time for large carts.' },
        { name: 'Queue Tax Lookups', summary: 'Look up tax in the background and confirm the order once it returns.' },
        { name: 'Upgrade Payment SDK', summary: 'The newer SDK reuses connections, which may save a second per order.' },
    ],
    tasks: [
        { name: 'Load test checkout', tags: ['problem:checkouttimeouts'], details: 'Simulate 200 orders a minute with large carts.' },
        { name: 'Profile the tax service', tags: ['problem:checkouttimeouts', 'solution:queuetaxlookups'] },
        { name: 'Read the payment SDK changelog', tags: ['solution:upgradepaymentsdk'] },
    ],
    published: {
        name: 'Login Emails Arrive Late', tags: ['project:customerportal'],
        summary: 'Sign-in emails can take several minutes to arrive, so customers give up and call support.',
        solutions: [
            { name: 'Send From Background Job', summary: 'Queue the email and return at once. The job sends it within seconds.', implemented: true },
            { name: 'Switch Email Provider', summary: 'Dropped: the delay was in our own request, not at the provider.', implemented: false },
        ],
    },
};

async function signIn(page) {
    await page.route('https://api.myfi.ws/**', route => route.fulfill({
        headers: { 'access-control-allow-origin': new URL(page.url() === 'about:blank' ? 'http://localhost' : page.url()).origin, 'access-control-allow-credentials': 'true' },
        contentType: 'text/plain',
        body: '1',
    }));
}

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

test('screenshots for the public pages', async ({ page }) => {
    test.setTimeout(180000);
    mkdirSync(OUT, { recursive: true });
    await page.clock.setFixedTime(new Date('2026-11-02T15:00:00Z'));
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    await test.step('add sample data', async () => {
        await page.goto('/dashboard');
        await expect(page.locator('app-workspace')).toContainText('Create your profile');
        await page.evaluate(async data => {
            const ts = window.taskStory;
            const api = (m, p, b) => ts.api.request(m, p, b);
            await api('POST', 'profiles', { name: 'Alex', email: 'alex@example.com' });
            const sam = await api('POST', 'profiles', { name: 'Sam', email: 'sam@example.com' });
            await api('POST', 'profiles', { name: 'Priya', email: 'priya@example.com' });
            await api('POST', 'subscription/change', { plan: 'team', name: 'Acme Web' });
            await api('POST', 'billing/pay');
            await api('POST', 'subscription/seats', { name: 'Sam', email: 'sam@example.com' });
            await api('POST', 'subscription/seats', { name: 'Priya', email: 'priya@example.com' });
            const team = (await api('GET', 'teams'))[0];
            await api('POST', 'session', { teamId: team.id });
            for (const p of data.projects) await api('POST', 'items/project', p);
            for (const f of data.features) await api('POST', 'items/feature', f);
            // A published story first, so it is the only one.
            const old = await api('POST', 'items/problem', data.published);
            const ids = [];
            for (const s of data.published.solutions) {
                const saved = await api('POST', 'items/solution', Object.assign({}, s, { tags: ['problem:loginemailsarrivelate', 'project:customerportal'] }));
                if (s.implemented) ids.push(saved.id);
            }
            await api('POST', 'stories/publish', { problemId: old.id, implemented: ids });
            await api('POST', 'items/problem', data.problem);
            for (const s of data.solutions) await api('POST', 'items/solution', Object.assign({ tags: ['problem:checkouttimeouts', 'project:customerportal'] }, s));
            for (const t of data.tasks) await api('POST', 'items/task', t);
            // Sam owns another problem, so the lists show more than one owner.
            await api('POST', 'session', { profileId: sam.id });
            await api('POST', 'session', { teamId: team.id });
            await api('POST', 'items/problem', { name: 'Slow Search Results', tags: ['project:customerportal'], summary: 'Search takes several seconds when a customer has many past orders.' });
            await api('POST', 'items/solution', { name: 'Index Order History', tags: ['problem:slowsearchresults', 'project:customerportal'], summary: 'Add an index on customer and order date.' });
            const alex = (await api('GET', 'profiles')).find(p => p.name === 'Alex');
            await api('POST', 'session', { profileId: alex.id });
            await ts.sessionChanged();
        }, sample);
        await expect(page.locator('app-workspace')).toContainText('Signed in as Alex · Team: Acme Web');
    });

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
        await expect(manager).toContainText('Problem: Checkout Timeouts - Owner: alex');
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
        await page.screenshot({ path: SHARE });
    });
});
