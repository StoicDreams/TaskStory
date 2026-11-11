import { expect, routeToFile, readText } from '../tests/support/site.mjs';
import { addSampleData } from './sample-data.mjs';

// Task Story's setup for screenshots/pages.shots.mjs. App pages show the sample team with Alex signed in,
// and each list page opens one of its items, so the pictures show the app in use rather than empty forms.

const isAppPage = route => readText(routeToFile(route)).includes('<app-workspace');

const openItem = {
    '/problems': 'Checkout Timeouts',
    '/solutions': 'Cache Cart Totals',
    '/tasks': 'Load test checkout',
    '/projects': 'Customer Portal',
    '/features': 'Saved Carts',
    '/stories': 'Login Emails Arrive Late',
};

export async function setup(page, route) {
    if (isAppPage(route)) await addSampleData(page);
}

export async function prepare(page, route) {
    if (!isAppPage(route)) return;
    await expect(page.locator('app-workspace')).toContainText('Signed in as Alex');
    if (route === '/dashboard') {
        const dashboard = page.locator('app-dashboard');
        for (const name of ['Problems', 'Solutions', 'Tasks']) await dashboard.getByRole('button', { name, exact: true }).click();
        await expect(dashboard.locator('app-item-manager')).toHaveCount(3);
    }
    const name = openItem[route];
    if (name) {
        const manager = page.locator('app-item-manager');
        await manager.locator('app-sortable-list').getByRole('button', { name }).click();
        await expect(manager).toContainText(name);
        await page.evaluate(() => window.scrollTo(0, 0));
    }
}
