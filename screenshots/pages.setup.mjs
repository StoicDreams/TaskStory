import { expect, routeToFile, readText } from '../tests/support/site.mjs';
import { addSampleData, dashboardPicture } from './sample-data.mjs';

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

const DASHBOARD = '/img/screenshots/dashboard.png';

/**
 * The home page shows the dashboard picture that site.shots.mjs saves in the same run, so its screenshot used to
 * depend on which was taken first. The page's screenshot takes that picture itself and shows it in place of the
 * file, so the result is the same in any order. It is taken at double resolution, as site.shots.mjs takes it.
 */
async function useFreshDashboardPicture(page) {
    const { width, height } = page.viewportSize();
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
    const picture = await dashboardPicture(page);
    // Leave the page as a visitor's: normal resolution, signed out, and none of the sample data.
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await session.send('Storage.clearDataForOrigin', { origin: new URL(page.url()).origin, storageTypes: 'all' });
    await session.detach();
    await page.unroute('https://api.myfi.ws/**');
    await page.route(`**${DASHBOARD}`, route => route.fulfill({ contentType: 'image/png', body: picture }));
}

export async function setup(page, route) {
    if (isAppPage(route)) await addSampleData(page);
    else if (readText(routeToFile(route)).includes(DASHBOARD)) await useFreshDashboardPicture(page);
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
