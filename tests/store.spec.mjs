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
            const karina = await api('POST', 'profiles', { name: 'Karina' });
            const team = await api('POST', 'teams', { name: 'Core' });
            await api('POST', 'teams', { id: team.id, name: 'Core', members: [karina.id] });
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
