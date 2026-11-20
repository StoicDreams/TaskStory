import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// PW_NICE, the machine setting the Playwright config reads, lowers the priority of the test run: 1 to 19, or idle for
// only spare CPU.
const nice = process.env.PW_NICE?.trim();
if (nice === 'idle' && process.platform === 'linux') {
    try { execFileSync('chrt', ['--all-tasks', '--idle', '-p', '0', `${process.pid}`], { stdio: 'ignore' }); } catch { try { os.setPriority(19); } catch { } }
} else if (nice) {
    try { os.setPriority(nice === 'idle' ? 19 : Math.min(19, Math.max(0, Number(nice) || 0))); } catch { }
}

// The unit tests: the site's files in Node, and its pages and components in jsdom (tests/unit/support/site.mjs). Tests
// that need a real browser run in Playwright (tests/browser). This file is the same in every site.
// - `vitest run --mode local-cdn` (npm run test:local-cdn) uses the framework from a MyFiCDN checkout next to this repo.
// - `vitest run --mode full` (npm run test:full) runs every test, ignoring the test cache, and records what passes.
export default defineConfig(({ mode }) => {
    if (mode === 'local-cdn') process.env.WEBUI_CDN_ROOT = fileURLToPath(new URL('../MyFiCDN/cdn', import.meta.url));
    return {
        test: {
            env: mode === 'full' ? { TEST_CACHE: '0' } : {},
            include: ['tests/unit/**/*.test.mjs'],
            // Downloads the framework from the live CDN once (tests/support/live-cdn.setup.mjs), and removes the cached
            // results of test files that are gone (tests/unit/support/test-cache.mjs).
            globalSetup: ['tests/support/live-cdn.setup.mjs', 'tests/unit/support/test-cache.mjs'],
            environment: 'node',
            pool: 'threads',
            // One test at a time: one file after another, and a file's tests in order. Tests running side by side
            // compete for the machine, and a test that fails because of that costs far more time than running them in turn.
            fileParallelism: false,
            maxWorkers: 1,
            // As long as Playwright gives a test, since a busy machine can slow a test well past its usual time.
            testTimeout: 60000,
            hookTimeout: 60000,
            // expect.poll waits as long as every other check (15 s, see tests/unit/support/page.mjs), checking often.
            expect: { poll: { timeout: 15000, interval: 20 } },
            // A failure is a failure: nothing is retried, so a test that only sometimes passes shows up.
            retry: 0,
            reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
            // Closing a dialog with Cancel rejects its promise with 'canceled', which most callers have no use for.
            // Every other unhandled error fails the run.
            onUnhandledError: error => !(error === 'canceled' || error?.message === 'canceled'),
        },
    };
});
