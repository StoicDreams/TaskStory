import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * The unit test cache. A test that passed is skipped while nothing it depends on has changed since: the test file, the
 * harness, and every file its page loaded, which the harness records as it serves them. Results are kept in
 * .test-cache/unit/<test file>.json, which is committed, so CI skips what already passed on the computer that made the
 * commit. TEST_CACHE=0 runs every test, and still records what passes.
 *
 * Only tests with a page are cached, since only what a page loads is recorded. A test file that reads files itself
 * (node:fs, node:child_process) is never cached, since those reads are not recorded. Files outside the repo, such as a
 * MyFiCDN checkout next to it, are kept by their path from the repo, so a result from one is never used for another.
 *
 * This file is the same in MyFiCDN, Task Proxy, and every site. Change them all at once.
 */
const ROOT = new URL('../../../', import.meta.url).pathname;
const CACHE_DIR = join(ROOT, '.test-cache', 'unit');
const TESTS_DIR = join(ROOT, 'tests', 'unit');
export const cacheEnabled = !['0', 'false', 'off', 'no'].includes(`${process.env.TEST_CACHE ?? ''}`.trim().toLowerCase());

// A change to any of these can change any test's result. The harness adds its own with configureCache.
const HARNESS = ['tests/unit/support', 'vitest.config.mjs', 'package-lock.json'];
/** Adds files, from the repo root, that every test depends on, such as a script the harness loads itself. */
export function configureCache({ harness = [] } = {}) {
    for (const path of harness) if (!HARNESS.includes(path)) HARNESS.push(path);
}
const READS_FILES = /['"]node:(fs|child_process)['"]/;

/** A path from the repo root, with forward slashes, as cache files store it. */
export const fromRoot = path => relative(ROOT, path).replace(/\\/g, '/');

const fileHashes = new Map();
/**
 * A file's content hash. Line endings are normalized, so a checkout that converts them, as Git on Windows can, still
 * matches. Files are read once per run: nothing they test changes while tests run.
 */
function fileHash(path) {
    if (!fileHashes.has(path)) {
        const full = join(ROOT, path);
        let hash = 'missing';
        if (existsSync(full)) {
            const stat = statSync(full);
            const files = stat.isDirectory()
                ? readdirSync(full).sort().map(name => `${path}/${name}`)
                : null;
            hash = files
                ? digest(files.map(file => `${file}:${fileHash(file)}`))
                : digest([readFileSync(full).toString('latin1').replace(/\r\n/g, '\n')]);
        }
        fileHashes.set(path, hash);
    }
    return fileHashes.get(path);
}

function digest(parts) {
    const hash = createHash('sha256');
    for (const part of parts) hash.update(part).update('\0');
    return hash.digest('hex');
}

/** The hash a test's result is kept under: its file, the harness, and the files it loaded. */
function hashFor(testFile, files) {
    return digest([...HARNESS, testFile, ...files].map(file => `${file}:${fileHash(file)}`));
}

/** The cached results for one test file. */
class FileCache {
    constructor(testPath) {
        this.testFile = fromRoot(testPath);
        this.path = join(CACHE_DIR, `${relative(TESTS_DIR, testPath)}.json`);
        this.cacheable = !READS_FILES.test(readFileSync(testPath, 'utf8'));
        this.entries = {};
        this.changed = !this.cacheable && existsSync(this.path);
        if (this.cacheable && existsSync(this.path)) {
            try {
                this.entries = JSON.parse(readFileSync(this.path, 'utf8'));
            } catch {
                this.changed = true;
            }
        }
    }
    /** Whether the test passed last time with everything it depends on as it is now. */
    isFresh(name) {
        const entry = this.entries[name];
        return cacheEnabled && this.cacheable && !!entry && Array.isArray(entry.files) && entry.hash === hashFor(this.testFile, entry.files);
    }
    passed(name, files) {
        if (!this.cacheable) return;
        const sorted = [...new Set(files)].sort();
        this.entries[name] = { hash: hashFor(this.testFile, sorted), files: sorted };
        this.changed = true;
    }
    failed(name) {
        if (name in this.entries) {
            delete this.entries[name];
            this.changed = true;
        }
    }
    /** Drops tests that are no longer in the file, then writes the file if anything changed. */
    save(names) {
        for (const name of Object.keys(this.entries)) {
            if (!names.includes(name)) {
                delete this.entries[name];
                this.changed = true;
            }
        }
        if (!this.changed) return;
        this.changed = false;
        const keys = Object.keys(this.entries).sort();
        if (!this.cacheable || keys.length === 0) {
            rmSync(this.path, { force: true });
            return;
        }
        mkdirSync(dirname(this.path), { recursive: true });
        const lines = keys.map(key => `  ${JSON.stringify(key)}: ${JSON.stringify(this.entries[key])}`);
        writeFileSync(this.path, `{\n${lines.join(',\n')}\n}\n`);
    }
}

const caches = new Map();
/** The cache for the test file at `testPath`. */
export function cacheFor(testPath) {
    if (!caches.has(testPath)) caches.set(testPath, new FileCache(testPath));
    return caches.get(testPath);
}

/** A test's name in its file: its describe blocks and its title. */
export function testName(task) {
    const names = [task.name];
    for (let suite = task.suite; suite && suite.type === 'suite' && suite.name; suite = suite.suite) names.unshift(suite.name);
    return names.join(' > ');
}

/** Every test's name in a file's tasks, including tests not run this time. */
export function allTestNames(tasks) {
    return tasks.flatMap(task => task.type === 'suite' ? allTestNames(task.tasks) : [testName(task)]);
}

/** Removes the cache files of test files that are gone. Vitest's globalSetup. */
export default function removeOrphans() {
    const walk = dir => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]) : [];
    for (const file of walk(CACHE_DIR)) {
        if (!existsSync(join(TESTS_DIR, relative(CACHE_DIR, file).replace(/\.json$/, '')))) rmSync(file);
    }
}
