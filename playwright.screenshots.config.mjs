import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// Captures screenshots instead of testing. Run it with PowerShell/screenshots.ps1, or npm run screenshots.
// Same browser and request handling as the tests, with the live CDN and no retries. Each script decides whether its
// pictures can be taken at the same time: pages.shots.mjs runs in parallel, and a script with one test runs in order.
// This file is the same in every site.
// The tests run one at a time, but pictures are not tests: they keep the machine's PW_WORKERS, as before.
const workersSetting = process.env.PW_WORKERS?.trim();
const workers = /^\d+$/.test(workersSetting || '') ? Number(workersSetting) : workersSetting || undefined;

export default defineConfig({
    ...base,
    workers,
    // Only the live CDN download: the test lock is for test runs.
    globalSetup: './tests/support/live-cdn.setup.mjs',
    testDir: './screenshots',
    testMatch: '**/*.shots.mjs',
    fullyParallel: false,
    retries: 0,
    reporter: [['list']],
    outputDir: './test-results/screenshots',
    projects: base.projects.filter(project => project.name === 'live-cdn'),
});
