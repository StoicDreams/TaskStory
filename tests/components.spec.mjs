import { test, expect, openPage } from './support/site.mjs';

// The general-purpose components are mounted on a public help page, so these tests need no sign-in.
async function mount(page, html) {
    await openPage(page, '/help/markdown');
    await page.evaluate(markup => {
        const host = document.createElement('div');
        host.id = 'test-host';
        host.innerHTML = markup;
        document.querySelector('webui-app').appendChild(host);
    }, html);
}

test.describe('app-tag-input', () => {
    test('Enter adds a cleaned tag with the prefix, and the remove button removes it', async ({ page }) => {
        await mount(page, '<app-tag-input label="Tags" tag-prefix="problem:"></app-tag-input>');
        const input = page.locator('app-tag-input').getByLabel('Tags');
        await input.fill('Home  Content!');
        await input.press('Enter');
        await expect.poll(() => page.evaluate(() => document.querySelector('app-tag-input').tags)).toEqual(['problem:homecontent']);
        await input.fill('bug');
        await input.press('Enter');
        await expect.poll(() => page.evaluate(() => document.querySelector('app-tag-input').tags)).toEqual(['problem:homecontent', 'problem:bug']);
        await input.fill('Team:Core');
        await input.press('Enter');
        await expect.poll(() => page.evaluate(() => document.querySelector('app-tag-input').tags)).toContain('team:core');
        await page.locator('app-tag-input').getByRole('button', { name: 'Remove tag problem:bug' }).click();
        await expect.poll(() => page.evaluate(() => document.querySelector('app-tag-input').tags)).toEqual(['problem:homecontent', 'team:core']);
    });

    test('a parent can cancel tag-add and apply its own rules', async ({ page }) => {
        await mount(page, '<app-tag-input label="Tags"></app-tag-input>');
        await page.evaluate(() => {
            const el = document.querySelector('app-tag-input');
            el.addEventListener('tag-add', ev => { ev.preventDefault(); el.tags = [`custom-${ev.detail.tag}`]; });
        });
        const input = page.locator('app-tag-input').getByLabel('Tags');
        await input.fill('x');
        await input.press('Enter');
        await expect.poll(() => page.evaluate(() => document.querySelector('app-tag-input').tags)).toEqual(['custom-x']);
    });

    test('readonly shows chips without a text box or remove buttons', async ({ page }) => {
        await mount(page, '<app-tag-input label="Tags" readonly></app-tag-input>');
        await page.evaluate(() => { document.querySelector('app-tag-input').tags = ['person:erik']; });
        await expect(page.locator('app-tag-input')).toContainText('person:erik');
        await expect(page.locator('app-tag-input').getByRole('button')).toHaveCount(0);
        await expect(page.locator('app-tag-input').getByLabel('Tags')).toBeHidden();
    });
});

test.describe('app-markdown-editor', () => {
    test('renders Markdown and strips scripts, handlers, and components', async ({ page }) => {
        await mount(page, '<app-markdown-editor label="Summary"></app-markdown-editor>');
        await page.evaluate(() => {
            document.querySelector('app-markdown-editor').value = '**bold** <img src=x onerror="window.__hacked=1"> <script>window.__hacked=2</script> <webui-content src="/d/root.md"></webui-content> <b data-trigger="x">b</b>';
        });
        const preview = page.locator('app-markdown-editor .markdown');
        await expect(preview.locator('strong')).toHaveText('bold');
        await expect(preview.locator('script')).toHaveCount(0);
        await expect(preview.locator('webui-content')).toHaveCount(0);
        await expect(preview.locator('[onerror]')).toHaveCount(0);
        await expect(preview.locator('[data-trigger]')).toHaveCount(0);
        expect(await page.evaluate(() => window.__hacked)).toBeUndefined();
    });

    test('switches between editor, both, and rendered views', async ({ page }) => {
        await mount(page, '<app-markdown-editor label="Summary"></app-markdown-editor>');
        const editor = page.locator('app-markdown-editor');
        await expect(editor).toHaveAttribute('view', 'both');
        await expect(editor.locator('webui-input-message')).toBeVisible();
        await expect(editor.locator('webui-paper')).toBeVisible();
        await page.evaluate(() => document.querySelector('app-markdown-editor').setAttribute('view', 'rendered'));
        await expect(editor.locator('webui-input-message')).toBeHidden();
        await page.evaluate(() => document.querySelector('app-markdown-editor').setAttribute('view', 'editor'));
        await expect(editor.locator('webui-paper')).toBeHidden();
        await expect(editor.locator('webui-input-message')).toBeVisible();
    });
});

test.describe('app-sortable-list', () => {
    test('selects on click and reorders with Alt+Arrow keys', async ({ page }) => {
        await mount(page, '<app-sortable-list label="Items"></app-sortable-list>');
        await page.evaluate(() => {
            const list = document.querySelector('app-sortable-list');
            window.__events = [];
            list.addEventListener('select', ev => window.__events.push(['select', ev.detail.id]));
            list.addEventListener('reorder', ev => window.__events.push(['reorder', ev.detail.ids.join(',')]));
            list.items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', mark: 'bug' }, { id: 'c', label: 'Gamma' }];
        });
        const list = page.locator('app-sortable-list');
        await list.getByRole('button', { name: 'Beta' }).click();
        await expect(list.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
        await list.getByRole('button', { name: 'Beta' }).press('Alt+ArrowUp');
        await expect.poll(() => page.evaluate(() => window.__events)).toEqual([['select', 'b'], ['reorder', 'b,a,c']]);
        await expect(list.getByRole('button', { name: 'Beta' })).toBeFocused();
    });

    test('nosort turns off reordering', async ({ page }) => {
        await mount(page, '<app-sortable-list label="Items" nosort></app-sortable-list>');
        await page.evaluate(() => {
            const list = document.querySelector('app-sortable-list');
            window.__events = [];
            list.addEventListener('reorder', () => window.__events.push('reorder'));
            list.items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
        });
        await page.locator('app-sortable-list').getByRole('button', { name: 'Beta' }).press('Alt+ArrowUp');
        expect(await page.evaluate(() => window.__events)).toEqual([]);
    });
});
