import * as fs from 'node:fs';

// The file reads of the site helpers (site-files.mjs). While a unit test runs, the harness records each path read here,
// so the test cache knows every file a test's result came from (tests/unit/support/test-cache.mjs). Outside a unit test
// nothing is recorded. This file is the same in every site.
export const reads = { record: null };
const note = path => reads.record?.(`${path}`);

export function existsSync(path) { note(path); return fs.existsSync(path); }
export function statSync(path, ...args) { note(path); return fs.statSync(path, ...args); }
export function readFileSync(path, ...args) { note(path); return fs.readFileSync(path, ...args); }
export function readdirSync(path, ...args) { note(path); return fs.readdirSync(path, ...args); }
