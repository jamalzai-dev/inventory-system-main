# Current verification — 17 October 2026

The in-place modernization passes **54 automated tests** and **59 browser checks**. Two legacy local-file checks are explicitly skipped by this managed Chromium environment because it blocks `file://` navigation. There are no remaining failing application checks. See the [modernization report](MODERNIZATION-REPORT.md) for the exact coverage, modified files and limits. The historical report below predates authenticated hosting and this redesign.

Run automated tests with `npm test`. No frontend build or new dependency installation is required.

Run the browser suites with an existing Playwright installation and browser, using the isolated fixture runner:

```sh
node tests/helpers/disposable-browser.mjs tests/browser.mjs tests/qa-browser.mjs tests/auth-browser.mjs tests/stock-print-browser.mjs tests/redesign-browser.mjs tests/redesign-edge-browser.mjs
```

Use `PLAYWRIGHT_MODULE` and `BROWSER_CHANNEL` to select the installed runtime. In the current managed environment the pre-existing wrapper is `/workspace/.inventory-cloud/playwright.cjs`, which selects installed Chromium. It is an environment-provided tool, not an application dependency. The command used here prefixes the command above with `PLAYWRIGHT_MODULE=/workspace/.inventory-cloud/playwright.cjs`.

The fixture runner uses the real application authentication routes with an isolated test admin and in-memory session store. It never uses staff credentials or the production PostgreSQL database. Each suite opens disposable browser contexts. For live database readiness run `npm run check:db` in the existing configured environment. This workspace lacks `PGDATABASE`, so that check could not connect here.

The current responsive matrix is 7 sections × 7 widths (320/375/390/428/768/1024/1440) × 2 languages × 2 themes = **196 combinations**. Selected browser contrast checks, native-dialog focus, Settings-only preferences/logout, stock deductions, JSON restore/recovery, print media and search updates pass. Generated evidence is in `tests/artifacts/` (ignored by Git); it contains synthetic fixture data.

---

# Historical verification — 11 October 2026

## Executed commands and results

Environment: Windows, Node v24.15.0, locally installed Microsoft Edge driven headlessly through the bundled Playwright package. All browser checks used disposable profiles with synthetic records, not the user's browser inventory.

1. `npm test` — **12 tests passed, 0 failed** (final run). Covers v2 round trips, exact Unicode/text preservation, malformed/missing collections, unsupported versions, duplicate IDs, relationship integrity, invalid numbers/dates, immutable CRUD, duplicate names/serials, stock boundaries, raw recovery, quota failures, corruption, stale writers, dictionary completeness and disabled legacy writes/seeding.
2. `node --check` on every `app/*.js`, `service-worker.js` and `tools/serve.mjs` — **all passed**.
3. `node tools/serve.mjs` — started at http://127.0.0.1:8080; HTTP readiness returned **200**. The public-file allowlist returned 200 for the app shell/module/icon and 404 for archive (including mixed-case paths), test exports and README.
4. Browser suite:

   ```powershell
   $env:PLAYWRIGHT_MODULE='C:\Users\Naqib-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
   node tests/browser.mjs
   ```

   **19 checks passed; no page or console errors.** The package location is specific to this development environment; another machine can use its own Playwright installation. Edge must be installed (or set BROWSER_CHANNEL to a supported installed browser).

## Browser coverage

- Existing v2 rendering with no startup data mutation.
- Category and supplier create/edit/search/delete; Unicode and exact whitespace retention; email validation.
- Material create/edit/delete, negative-quantity rejection, category/supplier selection and draft retention through language/theme changes, persisted stock edits, HTML-like strings rendered inertly.
- Referenced-category deletion protection.
- Modal Tab containment, Escape, and return focus.
- JSON download, invalid backup rejection, previewed/confirmed restore.
- Read-only legacy JSON with inert HTML-like content.
- Simulated localStorage write failure retains old data and the unsaved draft.
- A stale second browser tab cannot overwrite the first tab's committed state.
- Clear cancellation, confirmed clear, and recovery snapshot restore.
- Full-inventory AFN print report and print-media visibility.
- Keyboard-operated mobile navigation and automatic closing after selection.
- All **7 pages × 3 widths (360/768/1440) × 2 languages × 2 themes = 84 layout combinations**: correct direction and no document-level horizontal overflow. Material dialogs were checked in all 12 viewport/language/theme combinations. Wide tables intentionally scroll within their own focusable regions.
- Direct-file recovery exports existing v2 records from the same file context without mutations.
- Corrupt JSON recovery preserves original bytes; denied localStorage access presents recovery instead of crashing.
- Calculated contrast for primary/muted text, all stock badges, accent buttons and sidebar muted text is at least **4.5:1** in both themes. Input-border/surface contrast is at least **3:1**. These are selected token checks, not a full accessibility certification.

Screenshots were generated for dashboard and material dialogs across all 12 combinations. Desktop English light, mobile Pashto dark, mobile Pashto dialog and tablet Pashto light were visually inspected. Generated screenshots, synthetic export and the final browser-results.json are under tests/artifacts/ (ignored by Git).

## Fixes discovered during verification

- Native dialog tabbing could reach browser chrome: added explicit first/last focus wrapping.
- Storage property access itself can throw: deferred it through the repository adapter so recovery UI still loads.
- Backup file selection could be lost during theme/language refresh: retain the selected File independently of the page DOM.
- Increased Pashto helper text sizing and input-border contrast.

## Limits

Not tested: real staff data, Firefox/Safari, assistive-technology speech output, physical mobile devices, actual printer hardware, server authentication/shared persistence, PWA installation or offline service-worker lifecycle. The print DOM/media rules were tested, not a print-to-PDF driver. Translations have not received native-speaker sign-off. The unregistered service-worker draft is syntax-checked only. Cross-tab compare/write is best-effort rather than a transactional lock; use a single editing tab until a backend is introduced.
