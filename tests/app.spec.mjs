import { test, expect, openPage } from './support/site.mjs';

// The roles endpoint answers 1 (a signed-in user). Everything else the app does goes through the simulated API in IndexedDB.
async function signIn(page) {
    await page.route('https://api.myfi.ws/**', route => route.fulfill({
        headers: { 'access-control-allow-origin': new URL(page.url() === 'about:blank' ? 'http://localhost' : page.url()).origin, 'access-control-allow-credentials': 'true' },
        contentType: 'text/plain',
        body: '1',
    }));
}

async function openSignedIn(page, route, profileName = 'Erik') {
    await signIn(page);
    await openPage(page, route);
    const workspace = page.locator('app-workspace');
    await expect(workspace).toContainText('Create your profile');
    await workspace.getByLabel('Display name').fill(profileName);
    await workspace.getByRole('button', { name: 'Create Profile' }).click();
    await expect(workspace).toContainText(`Signed in as ${profileName}`);
}

async function api(page, method, path, body) {
    return page.evaluate(([m, p, b]) => window.taskStory.api.request(m, p, b), [method, path, body]);
}

test.describe('app-workspace', () => {
    test('asks guests to sign in', async ({ page }) => {
        await openPage(page, '/dashboard');
        const workspace = page.locator('app-workspace');
        await expect(workspace).toContainText('Sign in with your Stoic Dreams account');
        await expect(workspace.getByRole('button', { name: 'Sign In' })).toBeVisible();
        await expect(page.locator('app-dashboard')).toHaveCount(0);
    });

    test('asks a signed-in visitor for a profile, then shows the page', async ({ page }) => {
        await openSignedIn(page, '/dashboard');
        await expect(page.locator('app-dashboard')).toHaveCount(1);
        await expect(page.locator('app-workspace')).toContainText('Personal space (no team)');
    });
});

test.describe('app-item-manager', () => {
    test('creates a problem with its own tag and owner, and marks unsaved changes', async ({ page }) => {
        await openSignedIn(page, '/problems');
        const manager = page.locator('app-item-manager');
        await expect(manager).toContainText('Problem: New Problem - Owner: erik');
        await manager.getByLabel('Name').fill('Home Content');
        await expect(manager.locator('app-tag-input')).toContainText('problem:homecontent');
        await manager.getByRole('button', { name: 'Save Problem' }).click();
        await expect(manager).toContainText('Problem: Home Content - Owner: erik');
        await expect(manager.locator('app-sortable-list').getByRole('button', { name: 'Home Content' })).toBeVisible();
        await expect(manager.locator('app-tag-input')).toContainText('person:erik');
        await manager.locator('webui-input-message').first().locator('textarea').fill('The **home page** needs content.');
        await expect(manager).toContainText('(Changes Pending Save)');
        await manager.getByRole('button', { name: 'Undo' }).click();
        await expect(manager).not.toContainText('(Changes Pending Save)');
        const saved = await api(page, 'POST', 'items/query', { type: 'problem', tags: [] });
        expect(saved.map(i => i.tags)).toEqual([['problem:homecontent', 'person:erik']]);
    });

    test('shows the save error when a task has no tag', async ({ page }) => {
        await openSignedIn(page, '/tasks');
        const manager = page.locator('app-item-manager');
        await manager.getByLabel('Name').fill('Write tests');
        await manager.getByRole('button', { name: 'Save Task' }).click();
        await expect(manager.locator('webui-alert')).toContainText('Tasks need at least one tag');
    });

    test('saves automatically when the profile chooses autosave', async ({ page }) => {
        await openSignedIn(page, '/tasks');
        await page.evaluate(async () => {
            const ts = window.taskStory;
            const s = await ts.session();
            await ts.api.request('POST', 'profiles', { id: s.profile.id, name: s.profile.name, saveMode: 'auto' });
            await ts.api.request('POST', 'items/task', { name: 'Auto', tags: ['demo'] });
            await ts.sessionChanged();
        });
        const manager = page.locator('app-item-manager');
        await expect(manager.locator('app-sortable-list').getByRole('button', { name: 'Auto' })).toBeVisible();
        await expect(manager.getByRole('button', { name: 'Save Task' })).toBeHidden();
        await manager.locator('webui-switch').getByRole('radio', { name: 'Editor' }).click();
        await manager.locator('textarea').fill('Saved without clicking Save');
        await expect.poll(async () => (await api(page, 'POST', 'items/query', { type: 'task', tags: [] }))[0].details, { timeout: 5000 }).toBe('Saved without clicking Save');
    });

    test('stories are read only', async ({ page }) => {
        await openSignedIn(page, '/stories');
        const manager = page.locator('app-item-manager');
        await expect(manager).toContainText('Stories are published from problems and cannot be edited.');
        await expect(manager.getByRole('button', { name: /Add Story/ })).toHaveCount(0);
        await expect(manager.getByLabel('Name')).toHaveCount(0);
    });
});

test.describe('app-tag-filter', () => {
    test('filters every manager and offers quick tag toggles', async ({ page }) => {
        await openSignedIn(page, '/solutions');
        await api(page, 'POST', 'items/solution', { name: 'One', tags: ['project:alpha'] });
        await api(page, 'POST', 'items/solution', { name: 'Two', tags: ['project:beta'] });
        await page.evaluate(() => window.taskStory.emit('items', {}));
        const filter = page.locator('app-tag-filter');
        const list = page.locator('app-item-manager app-sortable-list');
        await expect(list.getByRole('button')).toHaveCount(2);
        await filter.getByRole('button', { name: 'project:alpha' }).click();
        await expect(list.getByRole('button')).toHaveCount(1);
        await expect(list.getByRole('button', { name: 'One' })).toBeVisible();
        await filter.getByRole('button', { name: 'project:beta' }).click();
        await expect(list.getByRole('button', { name: 'Two' })).toBeVisible();
        expect(await page.evaluate(() => window.taskStory.filter.get())).toEqual(['project:beta']);
        await filter.getByRole('button', { name: 'Bug', exact: true }).click();
        await expect(filter.getByRole('button', { name: 'Bug', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(list.getByRole('button')).toHaveCount(0);
    });
});

test.describe('app-dashboard', () => {
    test('manager toggles show and hide managers', async ({ page }) => {
        await openSignedIn(page, '/dashboard');
        const dashboard = page.locator('app-dashboard');
        await expect(dashboard.locator('app-item-manager')).toHaveCount(0);
        await dashboard.getByRole('button', { name: 'Problems', exact: true }).click();
        await dashboard.getByRole('button', { name: 'Tasks', exact: true }).click();
        await expect(dashboard.locator('app-item-manager')).toHaveCount(2);
        await expect(dashboard.locator('app-item-manager').first()).toHaveAttribute('type', 'task');
        await dashboard.getByRole('button', { name: 'Problems', exact: true }).click();
        await expect(dashboard.locator('app-item-manager')).toHaveCount(1);
    });
});

test.describe('app-story-publisher', () => {
    test('publishes a problem with its solutions as a story', async ({ page }) => {
        await openSignedIn(page, '/problems');
        const problem = await api(page, 'POST', 'items/problem', { name: 'Home Content', tags: [], summary: 'Needs content' });
        const keep = await api(page, 'POST', 'items/solution', { name: 'Add Content', tags: ['problem:homecontent'] });
        await api(page, 'POST', 'items/solution', { name: 'Rewrite Hero', tags: ['problem:homecontent'] });
        await page.evaluate(id => {
            const publisher = document.createElement('app-story-publisher');
            publisher.setAttribute('problem-id', id);
            document.querySelector('webui-app').appendChild(publisher);
        }, problem.id);
        const publisher = page.locator('app-story-publisher');
        await expect(publisher).toContainText('Rewrite Hero');
        await publisher.getByRole('button', { name: 'Rewrite Hero: Implemented. Toggle' }).click();
        await expect(publisher.getByRole('button', { name: 'Rewrite Hero: Dropped. Toggle' })).toBeVisible();
        expect(await page.evaluate(() => document.querySelector('app-story-publisher').publish())).toBe(true);
        const stories = await api(page, 'POST', 'items/query', { type: 'story', tags: [] });
        expect(stories).toHaveLength(1);
        expect(stories[0].integratedSolutions).toContain('Add Content');
        expect(stories[0].droppedSolutions).toContain('Rewrite Hero');
        expect(stories[0].tags).toEqual(expect.arrayContaining(['problem:homecontent', 'solution:addcontent', 'solution:rewritehero']));
        expect(await api(page, 'POST', 'items/query', { type: 'problem', tags: [] })).toEqual([]);
        expect(await api(page, 'POST', 'items/query', { type: 'solution', tags: [] })).toEqual([]);
        expect(keep.id).toBeTruthy();
    });
});

test.describe('app-account', () => {
    test('creates a team, makes it current, and adds a member', async ({ page }) => {
        await openSignedIn(page, '/account');
        const account = page.locator('app-account');
        await account.getByLabel('New profile name').fill('Karina');
        await account.getByRole('button', { name: 'Add Profile' }).click();
        await expect(account).toContainText('Karina (person:karina)');
        await account.getByLabel('New team name').fill('Core');
        await account.getByRole('button', { name: 'Create Team' }).click();
        await expect(page.locator('app-workspace')).toContainText('Team: Core');
        await account.getByRole('checkbox', { name: 'Karina' }).check();
        await account.getByRole('button', { name: 'Save Team' }).click();
        await expect(account).toContainText('2 members');
        await account.getByRole('button', { name: 'Switch to Karina' }).click();
        await expect(page.locator('app-workspace')).toContainText('Signed in as Karina');
    });
});
