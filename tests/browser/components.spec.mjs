import { test, expect, openPage, pageReady } from '../support/site.mjs';

// The general-purpose components are mounted on a public help page, so these tests need no sign-in.
async function mount(page, html) {
    await openPage(page, '/help/markdown');
    await page.evaluate(markup => {
        const host = document.createElement('div');
        host.id = 'test-host';
        host.innerHTML = markup;
        document.querySelector('webui-app').appendChild(host);
    }, html);
    // The components load their scripts once they are on the page, so wait for them before a test uses them.
    await pageReady(page);
}

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
        // The image is kept without its handler, so wait for it to finish failing to load, which is when onerror would run.
        await expect.poll(() => preview.locator('img').evaluate(img => img.complete)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.__hacked)).toBeUndefined();
    });

});

