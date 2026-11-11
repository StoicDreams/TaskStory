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
}
