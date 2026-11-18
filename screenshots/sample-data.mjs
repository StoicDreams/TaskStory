import { expect } from '../tests/support/site.mjs';

// Sample data for screenshots: one team, Acme Web, with Alex signed in. The app runs against the simulated API,
// so nothing here reaches a real account.
export const sample = {
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

export async function signIn(page) {
    await page.route('https://api.myfi.ws/**', route => route.fulfill({
        headers: { 'access-control-allow-origin': new URL(page.url() === 'about:blank' ? 'http://localhost' : page.url()).origin, 'access-control-allow-credentials': 'true' },
        contentType: 'text/plain',
        body: '1',
    }));
}

/** Signs in and adds the sample team and its items. Leaves the page on /dashboard. */
export async function addSampleData(page) {
    await signIn(page);
    await page.goto('/dashboard');
    // The first page of each test loads every component cold, and with several workers at once that can take
    // well over the default 5 seconds.
    await expect(page.locator('app-workspace')).toContainText('Create your profile', { timeout: 30000 });
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
}

/**
 * Waits for everything that changes a picture: fonts, icons, images, and fades. Nothing here waits for an amount of time.
 * The same steps as pictureReady in pages.shots.mjs, which does not export it. site.shots.mjs and pages.setup.mjs use this one.
 */
export async function pictureReady(page) {
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
        await document.fonts.ready;
        // Two frames, so the browser has painted the finished page before the picture is taken.
        await frame();
        await frame();
    });
}

/**
 * A picture of a page or an element once it has stopped changing: it is taken again until two in a row are the same.
 * The browser redraws text more sharply a few frames after a fade ends, and nothing says when it has, so this is how
 * the picture comes out the same on every run without waiting for an amount of time.
 */
export async function stillPicture(target, options = {}) {
    let last = await target.screenshot(options);
    for (let tries = 0; tries < 30; tries++) {
        const next = await target.screenshot(options);
        if (next.equals(last)) return next;
        last = next;
    }
    throw new Error('The picture never stopped changing, so something on the page is still moving.');
}

/**
 * Adds the sample data and returns a picture of the dashboard with its Problems, Solutions, and Tasks lists open.
 * The home page shows this picture, so both site.shots.mjs (which saves it) and the home page's screenshot take it here.
 */
export async function dashboardPicture(page) {
    await addSampleData(page);
    const dashboard = page.locator('app-dashboard');
    for (const name of ['Problems', 'Solutions', 'Tasks']) await dashboard.getByRole('button', { name, exact: true }).click();
    await expect(dashboard.locator('app-item-manager')).toHaveCount(3);
    await expect(dashboard.locator('app-item-manager[type="problem"] app-sortable-list').getByRole('button', { name: 'Checkout Timeouts' })).toBeVisible();
    // Start at the manager toggles, so the picture shows the lists rather than the tag filter above them.
    await dashboard.getByRole('button', { name: 'Tasks', exact: true }).evaluate(el => el.closest('webui-paper').scrollIntoView({ block: 'start', behavior: 'instant' }));
    // Keep hover tooltips out of the picture.
    await page.mouse.move(0, 0);
    await pictureReady(page);
    return stillPicture(page);
}
