import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// Captures screenshots instead of testing. Run it with PowerShell/screenshots.ps1, or npm run screenshots.
// Same browser and request handling as the tests, with the live CDN, one browser at a time, and no retries.
export default defineConfig({
    ...base,
    testDir: './screenshots',
    testMatch: '**/*.shots.mjs',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    outputDir: './test-results/screenshots',
    projects: base.projects.filter(project => project.name === 'live-cdn'),
});
