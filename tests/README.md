# Tests

The site's tests, in two tiers. They need no build and no server: every request to the site is answered from `webapp/`, laid out the way Trunk copies it, with the framework from the live CDN. Analytics and other outside requests are blocked, and `api.myfi.ws` returns an empty response. Both tiers test the minified files the site loads, and run one test at a time.

- **Unit tests** ([Vitest](https://vitest.dev) in `tests/unit`) check the site's files in Node, and run its pages and components in jsdom, a simulated browser with no layout. Most tests belong here.
- **Browser tests** ([Playwright](https://playwright.dev) in `tests/browser`) open every page in a real browser, and test what needs one: layout and sizes, the mouse, scrolling, canvas, media, and real navigation.

```bash
npm install
npm test
```

| Command | Purpose |
|---|---|
| `npm test` | Run the unit tests, then the browser tests |
| `npm run test:unit` | Run only the unit tests |
| `npm run test:browser` | Run only the browser tests |
| `npm run test:full` | Run every test, ignoring the unit test cache |
| `npm run test:local-cdn` | Run both with the framework from a `MyFiCDN` checkout next to this repo, to try unreleased framework changes |
| `npm run test:ui` | Open the Playwright UI for the browser tests |
| `npx vitest run tests/unit/site.test.mjs` | Run one unit test file |

**Unit test cache:** a unit test with a `page` that passed is skipped while nothing it depends on has changed: its test file, the harness, and every file it read, through its page or the site helpers. Results are kept in `.test-cache/unit/`, which is committed, so CI skips what passed before the commit. A failed test always runs again, and a test file that reads files itself (`node:fs`) always runs.

## Files

- `unit/site.test.mjs`, `browser/site.spec.mjs`, and everything in `support/` and `unit/support/` are the same in every site. Change them in every site at once. `unit/support/page.mjs`, `stand-ins.mjs` and `test-cache.mjs` are also shared with MyFiCDN and Task Proxy.
- `service-worker.spec.mjs` and `scripts.spec.mjs` are the same in every site, the CDN, and Task Proxy. They test the service worker and the `PowerShell` scripts, and the script tests need PowerShell 7 (`pwsh`).
- `site.config.mjs` holds this site's settings.
- `helpers/` holds this site's own helpers for both tiers, when it has any. They import nothing from either tier's harness.
- Test this site's own pages and components in `unit/{name}.test.mjs`, with `test`, `expect`, and `openPage` from `unit/support/site.mjs`. Only what needs a real browser goes in `browser/{name}.spec.mjs`, with the same helpers from `support/site.mjs`. A unit test that needs layout (`boundingBox`, `page.mouse`) fails with a message saying it belongs in `tests/browser`.

Rust code in `webapp/src` is tested with `cargo test`. Components that call `webui.worker` need `webapp/pkg`, which `PowerShell/RunLocal.ps1` or `wasm-pack build --target web --out-dir pkg` (run in `webapp`) creates.
