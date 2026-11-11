import { test, expect, openPage } from './support/site.mjs';

// app-store holds the simulated API. Each test gets a new browser context, so a new, empty IndexedDB.
async function store(page) {
    await openPage(page, '/help/workflow');
    await page.evaluate(() => {
        document.querySelector('webui-app').appendChild(document.createElement('app-store'));
    });
    await page.waitForFunction(() => !!window.taskStory);
}

test.describe('app-store', () => {
    test('makes tags from names the way the legacy app did', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(() => {
            const t = window.taskStory.tags;
            return [t.fromName('Add Content', 'solution:'), t.fromName('Home -- Content!!', 'problem:'), t.filterName('Bug'), t.fromName('   ', 'problem:'), t.theme('problem:x'), t.theme('blocked')];
        });
        expect(result).toEqual(['solution:addcontent', 'problem:home-content', 'bug', '', 'secondary', 'danger']);
    });

    test('items need a name and a tag, get their own tag and an owner, and only the owner can save problems', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(async () => {
            const ts = window.taskStory;
            const api = (m, p, b) => ts.api.request(m, p, b).catch(ex => `error ${ex.status}: ${ex.message}`);
            const out = {};
            out.noProfile = await api('POST', 'items/problem', { name: 'X' });
            const erik = await api('POST', 'profiles', { name: 'Erik' });
            out.noName = await api('POST', 'items/problem', { name: ' ' });
            out.taskNoTag = await api('POST', 'items/task', { name: 'Do it' });
            const problem = await api('POST', 'items/problem', { name: 'Home Content', tags: ['problem:other', 'demo'] });
            out.problemTags = problem.tags;
            const karina = await api('POST', 'profiles', { name: 'Karina', email: 'karina@example.com' });
            await api('POST', 'subscription/change', { plan: 'team', name: 'Core' });
            await api('POST', 'billing/pay');
            await api('POST', 'subscription/seats', { name: 'Karina', email: 'karina@example.com' });
            const team = (await api('GET', 'teams'))[0];
            await api('POST', 'session', { teamId: team.id });
            const shared = await api('POST', 'items/problem', { name: 'Shared', tags: [] });
            await api('POST', 'session', { profileId: karina.id });
            await api('POST', 'session', { teamId: team.id });
            out.karinaSees = (await api('POST', 'items/query', { type: 'problem', tags: [] })).map(i => i.name);
            out.karinaEdits = await api('POST', 'items/problem', Object.assign({}, shared, { summary: 'mine now' }));
            const takeover = await api('POST', 'items/problem', Object.assign({}, shared, { tags: ['problem:shared'] }));
            out.takeoverOwner = takeover.tags.filter(t => t.startsWith('person:'));
            out.eriksPersonalHidden = (await api('POST', 'items/query', { type: 'problem', tags: [] })).length;
            await api('POST', 'session', { profileId: erik.id });
            return out;
        });
        expect(result.noProfile).toBe('error 401: Create or pick a profile first.');
        expect(result.noName).toMatch(/^error 400: Please enter a name/);
        expect(result.taskNoTag).toMatch(/^error 400: Tasks need at least one tag/);
        expect(result.problemTags).toEqual(['problem:homecontent', 'demo', 'person:erik']);
        expect(result.karinaSees).toEqual(['Shared']);
        expect(result.karinaEdits).toMatch(/^error 403: Problems can only be saved by the owner/);
        expect(result.takeoverOwner).toEqual(['person:karina']);
        expect(result.eriksPersonalHidden).toBe(1);
    });

    test('tasks stay private to their profile', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(async () => {
            const ts = window.taskStory;
            const erik = await ts.api.request('POST', 'profiles', { name: 'Erik' });
            await ts.api.request('POST', 'items/task', { name: 'Private', tags: ['demo'] });
            const karina = await ts.api.request('POST', 'profiles', { name: 'Karina' });
            await ts.api.request('POST', 'session', { profileId: karina.id });
            const karinaTasks = await ts.api.request('POST', 'items/query', { type: 'task', tags: [] });
            await ts.api.request('POST', 'session', { profileId: erik.id });
            const erikTasks = await ts.api.request('POST', 'items/query', { type: 'task', tags: ['demo'] });
            return { karina: karinaTasks.length, erik: erikTasks.map(t => t.name) };
        });
        expect(result).toEqual({ karina: 0, erik: ['Private'] });
    });

    test('queries return items with every filter tag, in sort order', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(async () => {
            const ts = window.taskStory;
            await ts.api.request('POST', 'profiles', { name: 'Erik' });
            const a = await ts.api.request('POST', 'items/task', { name: 'A', tags: ['x', 'y'] });
            const b = await ts.api.request('POST', 'items/task', { name: 'B', tags: ['x'] });
            await ts.api.request('POST', 'items/task/sort', { ids: [b.id, a.id] });
            return {
                x: (await ts.api.request('POST', 'items/query', { type: 'task', tags: ['x'] })).map(i => i.name),
                xy: (await ts.api.request('POST', 'items/query', { type: 'task', tags: ['x', 'y'] })).map(i => i.name),
            };
        });
        expect(result).toEqual({ x: ['B', 'A'], xy: ['A'] });
    });

    test('the filter replaces tags with the same prefix and keeps plain tags', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(() => {
            const f = window.taskStory.filter;
            f.set([]);
            f.add('problem:one');
            f.add('bug');
            f.add('problem:two');
            f.toggle('bug');
            return f.get();
        });
        expect(result).toEqual(['problem:two']);
    });
});

test.describe('app-store subscriptions', () => {
    test('a Team plan is a team: it waits for payment, its seats are members, and leaving it deletes the team data', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(async () => {
            const ts = window.taskStory;
            const api = (m, p, b) => ts.api.request(m, p, b).catch(ex => `error ${ex.status}: ${ex.message}`);
            const out = {};
            const erik = await api('POST', 'profiles', { name: 'Erik', email: 'erik@example.com' });
            const karina = await api('POST', 'profiles', { name: 'Karina', email: 'karina@example.com' });
            out.free = (await api('GET', 'subscription')).currentKey;
            out.seatsOnFree = await api('POST', 'subscription/seats', { name: 'Karina', email: 'karina@example.com' });
            out.noName = await api('POST', 'subscription/change', { plan: 'team' });
            out.pending = await api('POST', 'subscription/change', { plan: 'team', name: 'Core' });
            const team = (await api('GET', 'teams'))[0];
            await api('POST', 'session', { teamId: team.id });
            out.pendingSave = await api('POST', 'items/project', { name: 'Alpha', tags: [] });
            out.paid = await api('POST', 'billing/pay');
            await api('POST', 'items/project', { name: 'Alpha', tags: [] });
            out.badSeat = await api('POST', 'subscription/seats', { name: 'Karina', email: 'nope' });
            await api('POST', 'subscription/seats', { name: 'Karina', email: 'Karina@Example.com' });
            await api('POST', 'session', { profileId: karina.id });
            await api('POST', 'session', { teamId: team.id });
            out.karinaSees = (await api('POST', 'items/query', { type: 'project', tags: [] })).map(i => i.name);
            await api('POST', 'session', { profileId: erik.id });
            out.seats = (await api('GET', 'subscription/seats')).map(s => [s.name, s.isActive, s.isRemoveable]);
            out.currentSeats = (await api('GET', 'subscription')).currentSeats;
            await api('POST', 'billing/renewal', { enabled: false });
            out.expired = await api('POST', 'billing/end-period');
            out.expiredSave = await api('POST', 'items/project', { name: 'Beta', tags: [] });
            await api('POST', 'billing/pay');
            await api('POST', 'subscription/change', { plan: '' });
            out.teamsAfter = await api('GET', 'teams');
            out.session = (await api('GET', 'session')).scope;
            out.status = await api('GET', 'subscription');
            return out;
        });
        expect(result.free).toBe('');
        expect(result.seatsOnFree).toBe('error 400: Seats are only available on Team plans.');
        expect(result.noName).toMatch(/^error 400: Please enter a name for your subscription/);
        expect(result.pending).toMatchObject({ currentKey: 'team', isActive: false, name: 'Core' });
        expect(result.pendingSave).toMatch(/^error 403: The Core subscription is not active/);
        expect(result.paid).toMatchObject({ currentKey: 'team', isActive: true, renewalEnabled: true });
        expect(result.badSeat).toBe('error 400: Enter a valid email address.');
        expect(result.karinaSees).toEqual(['Alpha']);
        expect(result.seats).toEqual([['Erik', true, false], ['Karina', true, true]]);
        expect(result.currentSeats).toBe(2);
        expect(Date.parse(result.expired.currentExpiration)).toBeLessThan(Date.now());
        expect(result.expiredSave).toMatch(/^error 403: The Core subscription is not active/);
        expect(result.teamsAfter).toEqual([]);
        expect(result.session).toMatch(/^personal:/);
        expect(result.status).toMatchObject({ currentKey: '', isActive: false });
    });

    test('the free plan limits items, and a paid plan removes the limits', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(async () => {
            const ts = window.taskStory;
            const api = (m, p, b) => ts.api.request(m, p, b).catch(ex => `error ${ex.status}: ${ex.message}`);
            const free = ts.plans.find(p => p.key === '');
            await api('POST', 'profiles', { name: 'Erik' });
            for (let i = 0; i < free.projects; i++) await api('POST', 'items/project', { name: `P${i}`, tags: [] });
            const out = {};
            out.overProjects = await api('POST', 'items/project', { name: 'One more', tags: [] });
            await api('POST', 'items/problem', { name: 'Home', tags: [] });
            for (let i = 0; i < free.solutionsPerProblem; i++) await api('POST', 'items/solution', { name: `S${i}`, tags: ['problem:home'] });
            out.overSolutions = await api('POST', 'items/solution', { name: 'One more', tags: ['problem:home'] });
            const existing = (await api('POST', 'items/query', { type: 'project', tags: [] }))[0];
            out.editStillWorks = (await api('POST', 'items/project', Object.assign({}, existing, { summary: 'edit' }))).summary;
            await api('POST', 'subscription/change', { plan: 'solo-pro' });
            out.stillPending = await api('POST', 'items/project', { name: 'Pending', tags: [] });
            await api('POST', 'billing/pay');
            out.afterPaying = (await api('POST', 'items/project', { name: 'Paid', tags: [] })).name;
            out.teams = await api('GET', 'teams');
            out.free = free;
            return out;
        });
        const { free } = result;
        expect(result.overProjects).toContain(`error 403: Your Single Developer plan allows ${free.projects} projects`);
        expect(result.overSolutions).toContain(`error 403: Your Single Developer plan allows ${free.solutionsPerProblem} solutions for each problem`);
        expect(result.editStillWorks).toBe('edit');
        expect(result.stillPending).toContain(`error 403: Your Single Developer plan allows ${free.projects} projects`);
        expect(result.afterPaying).toBe('Paid');
        expect(result.teams).toEqual([]);
    });

    test('stories older than the plan keeps them are deleted', async ({ page }) => {
        await store(page);
        const result = await page.evaluate(async () => {
            const ts = window.taskStory;
            await ts.api.request('POST', 'profiles', { name: 'Erik' });
            await ts.api.request('POST', 'items/problem', { name: 'Old', tags: [] });
            await ts.api.request('POST', 'items/problem', { name: 'New', tags: [] });
            const problems = await ts.api.request('POST', 'items/query', { type: 'problem', tags: [] });
            for (const p of problems) await ts.api.request('POST', 'stories/publish', { problemId: p.id, implemented: [] });
            // Age one story past the free plan's retention directly in IndexedDB.
            const days = ts.plans.find(p => p.key === '').storyRetentionDays;
            const db = await new Promise(r => { const req = indexedDB.open('taskstory-poc'); req.onsuccess = () => r(req.result); });
            const stories = await ts.api.request('POST', 'items/query', { type: 'story', tags: [] });
            const old = stories.find(s => s.name === 'Old');
            old.created = new Date(Date.now() - (days + 1) * 864e5).toISOString();
            await new Promise(r => { const tx = db.transaction('items', 'readwrite'); tx.objectStore('items').put(old); tx.oncomplete = r; });
            db.close();
            return (await ts.api.request('POST', 'items/query', { type: 'story', tags: [] })).map(s => s.name);
        });
        expect(result).toEqual(['New']);
    });
});
