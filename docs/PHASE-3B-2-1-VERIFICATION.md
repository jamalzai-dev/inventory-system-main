# Phase 3B-2.1 — UI stabilization and refinement

Verification date: **20 October 2026**, Asia/Kabul.

This phase enhances the existing white-and-blue interface. The frontend still uses
its existing localStorage repository. PostgreSQL frontend integration, database
migrations, production data changes, commits, pushes and deployment are outside
this phase and were not performed.

## Regressions reproduced and repaired

### English/Pashto translation

Before changes, `node --test tests/data.test.js` produced **13 passes and 1 failure**.
The working tree contained `reviewTranslation: ['']`, so the dictionary test found
one entry instead of an English/Pashto pair. Selecting Pashto caused `.replace()`
to run on undefined when rendering the Settings review note.

The committed Phase 3B-1 dictionary had both translations. This was an existing
uncommitted frontend edit, preserved during Phase 3B-2 and now explicitly authorized
for repair. The fix restores that exact established bilingual pair; other valid
translations were preserved. The original dictionary test now passes. Settings
language, appearance, focus restoration, persistence and real logout all pass.
No new translation wording was invented. Fluent university staff should still
review the existing Pashto wording before deployment.

### The three document overflow failures

All three original assertions reproduced before source edits:

| Suite | Reproduced failure |
| --- | --- |
| `tests/browser.mjs:108` | Materials at 768px, English/light |
| `tests/redesign-edge-browser.mjs:99` | 720px / 200% layout equivalent |
| `tests/stock-print-browser.mjs:67` | Document overflow in the removal width/language/theme matrix |

They shared the same underlying problem. At widths above 650px, the text labels
inside Edit/Delete buttons become absolutely positioned, visually hidden spans.
Their buttons were not positioned containing blocks. The spans could therefore
contribute overflow outside the table's scroll container even though visually
clipped. In a disposable 720px reproduction, the document extended to **980px**;
the hidden Delete span's right edge was approximately **980.31px**.

Adding `position: relative` to `.row-actions .button` contained those labels in the
scrolling table and immediately returned the same document to **720px**. The
original three suites then passed before broader polishing began. No global
overflow suppression, hidden actions, removed information or weakened assertions
were used. Table content continues to scroll within its own labeled region.

Baseline measurements and screenshots are saved under
`tests/artifacts/phase-3b-2-1/overflow-baseline.json` and `before-*.png`.

### Additional issues found by visual review

- The empty donut chart's explanatory paragraph was a third child in a narrow
  horizontal flex layout, squeezing legend words into nearly vertical letters.
  The donut layout now wraps, reserves the explanation's own row and prevents
  the legend from shrinking into unreadable fragments. New checks cover empty
  charts across all eight required widths, both languages and both themes.
- Dark-mode print output retained dark colors because the existing
  `:root[data-theme='dark']` selector outranked the print stylesheet's `:root`.
  The print override now matches that specificity, producing dark text on white
  paper regardless of the current theme. New assertions check computed print
  colors; print-media screenshots and a PDF were generated with long RTL records.
- During refinement, a login button background transition briefly reduced text
  contrast on a system-theme switch. The rendered contrast test caught it; the
  background crossfade was removed. Hover and pressed feedback remain.

## UI/UX audit and improvements

| Area | Result |
| --- | --- |
| Visual system | Retained blue branding, white surfaces and dark theme; aligned the light canvas with `#F8FAFC`. Reused central tokens, logical properties and the existing icon family. |
| Dashboard cards | Increased label/helper readability while preserving all four cards, counts, semantic badges and mobile stacking. No calculations or statistics changed. |
| Charts | Larger category labels, readable legend spacing, stronger chart colors in both themes, and repaired narrow empty states. Exact record counts, zero categories and donut proportions remain unchanged. |
| Sidebar | Clearer active marker using the logical start border; existing keyboard focus trap, Escape behavior, mobile drawer and empty official-logo placeholder retained. |
| Header/search | Persistent shared search retained on every page. Results size themselves to the actual visible viewport and update on resize/scroll, including visual-viewport changes. Scroll is contained inside results; keyboard selection, clear, Escape, grouping and safe text rendering remain. Short-screen headers no longer consume a permanent sticky strip. |
| Materials | More readable headers, serial text, badges and counts; tabular numeric alignment. Sticky action cells keep Edit/Delete reachable while desktop/tablet columns scroll. Mobile cards retain every field and labeled 44px actions. |
| Forms | Full-width names, numeric/decimal mobile keyboard hints, sticky dialog headings and Save/Cancel footers, and scroll padding for focused controls. Labels, required fields, validation, drafts and stored values retain their previous semantics. |
| Categories/suppliers | Shared table, action, typography and form improvements apply consistently. Long mixed-direction names/contact details remain readable; CRUD and relationship restrictions pass. |
| Settings | Restored bilingual rendering, clearer spacing between preferences/session cards and an inset focus ring inside segmented controls. Language, appearance and Sign Out remain exclusively in Settings. |
| Login | Consistent canvas, explicit 16px inputs, 44px password-visibility target, pressed feedback and short-height alignment. Authentication code, loading/errors, registration policy and empty logo area remain unchanged. |
| Reports/printing | Clearer shared tables and numeric summaries; long values wrap. Both print routes retain correct rows/totals; dark-mode printing now uses white paper colors. |
| Backup/restore | Consistent card actions, stronger text sizing and wrapping for long file names. JSON format, preview/confirmation, raw exports, snapshots, recovery and selected-file persistence remain unchanged. |
| Accessibility | Explicit table relationships survive the mobile card layout; table/chart focus rings remain visible within clipped cards. Existing live errors, status announcements, dialog focus handling and reduced-motion behavior retained. |

## Files changed by this phase

- `app/i18n.js` — repaired translation by restoring the committed bilingual entry;
  consequently this file no longer differs from HEAD.
- `app/styles.css` — overflow repair, shared visual refinements, responsive actions,
  charts, dialogs, focus and print corrections.
- `app/main.js` — form presentation and mobile input keyboard hints only.
- `app/search.js` — visible-viewport bounds for the results panel.
- `app/ui.js` — explicit table/row/header/cell semantics for mobile presentation.
- `login/login.css` — focused login presentation/touch/short-height refinements.
- `tests/auth-browser.mjs` — added 720px coverage and a short-height touch-target
  check; all original assertions retained.
- `tests/ui-stabilization-browser.mjs` — new responsive/accessibility/visual suite.
- `README.md`, `docs/TESTING.md`, `docs/INVENTORY-INTEGRATION.md` — current UI status
  and test/integration links.
- `docs/PHASE-3B-2-1-VERIFICATION.md` — this report.

All pre-existing backend changes and new Phase 3B-2 files remain present. Other
pre-existing documentation changes and the Kandahar University footer edits in
`login.html` and `archive/index.html` were preserved.

## Verification commands

Windows, Node.js **v24.15.0**, PostgreSQL **18**, headless Microsoft Edge
**155.0.4283.62** through the existing bundled Playwright installation.

```powershell
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
npm test

$env:PLAYWRIGHT_MODULE='C:\Users\Naqib-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/helpers/disposable-browser.mjs tests/auth-browser.mjs tests/browser.mjs tests/redesign-browser.mjs tests/redesign-edge-browser.mjs tests/stock-print-browser.mjs tests/qa-browser.mjs tests/ui-stabilization-browser.mjs
```

The Playwright path is machine-specific; use an existing installation elsewhere.
No dependencies, CDN resources, build system or new framework were added.
The fixture runner uses synthetic Admin credentials, in-memory sessions and
disposable browser contexts. The integration helper initializes separate clusters
on random loopback ports, never the configured production database.

## Automated and browser results

`npm test` with `TEST_PG_BIN`: **122 passed, 0 failed, 0 skipped**. This includes
**38 real PostgreSQL scenarios**: 17 existing metadata scenarios and 21 transactional
stock scenarios, plus the two parent tests. The original translation test passes.

| Browser suite | Result |
| --- | --- |
| Authentication | 8 passed |
| Main regression | 19 passed, 0 skipped |
| Redesign | 9 passed |
| Redesign edge | 7 passed |
| Stock/printing | 8 passed |
| QA | 11 passed, 0 skipped |
| New UI stabilization | 6 passed, 0 skipped |

**Total: 68 browser checks passed, 0 failed, 0 skipped.** The stabilization suite
records its 224-case primary matrix, 19 generated screenshots and check outcomes
in `tests/artifacts/phase-3b-2-1/results.json`. Its 32 empty-chart cases also pass.
All six changed/repaired JavaScript files pass `node --check`; `git diff --check`
passes. After documentation changes, `node --test tests/repository.test.js`
passes **3/3** for links, resources, protected serving and port validation.

Coverage includes CRUD, batch removal, duplicate submission guards, stale-tab
protection, JSON restore/recovery/export, dashboard calculations, filtering,
sorting, See All, global search, Settings persistence, logout, print output,
resource failures, genuine insecure HTTP origin and Android touch emulation.
Direct-file recovery checks also ran here; none were skipped by browser policy.

## Responsive and accessibility evidence

- Primary matrix: **7 sections × 8 widths × 2 languages × 2 themes = 224 cases**,
  including functional keyboard-operated global search on each section.
- Required widths: **320, 375, 390, 428, 720, 768, 1024, 1440px**.
- Adjacent layout boundaries: **649/650/651, 699/700/701, 719/721, 767/769,
  899/900/901px**, each in English and Pashto: 26 additional Materials cases.
- **320×400px** short-screen forms/search in both languages/themes, covering all
  three record forms, validation, labels, reachable Save controls and focus return.
- Empty charts across 32 width/language/theme combinations; long unbroken names,
  long category names, mixed directions and null/empty optional displays.
- Login at all eight widths in light/dark appearances, plus 320×400 touch checks.
- Existing 200% equivalent reflow test passes. This is viewport-based equivalence,
  not physical browser zoom or an actual phone keyboard test.
- Original text/button contrast checks pass (4.5:1 for selected normal text pairs);
  control boundaries pass 3:1. New chart-color/surface checks pass 3:1 in both themes.
- Keyboard navigation, search active-descendant, explicit mobile table semantics,
  visible focus, drawer trapping, dialog focus return and reduced motion verified.

## Visual review and artifacts

Screenshots were opened and visually inspected; test success alone was not used
as the visual acceptance criterion. Selected files under
`tests/artifacts/phase-3b-2-1/`:

- `before-dashboard.png`, `before-materials-720.png`: baseline appearance/overflow.
- `after-dashboard-desktop.png`: four cards, charts and inventory preview.
- `after-dashboard-ps-dark.png`: mobile RTL, dark charts and record cards.
- `after-materials-tablet.png`, `after-materials-mobile.png`: contained table
  scrolling/sticky actions and mobile labels/buttons.
- `after-settings-ps-dark.png`: translated preferences and session controls.
- `after-form-short-en-light.png`, `after-form-short-ps-dark.png`: reachable
  dialog heading/footer with a short viewport and focused description field.
- `after-search-short-ps-dark.png`: constrained, scrollable RTL results panel.
- `after-backup-desktop.png`, `after-reports-desktop.png`: consistent sections.
- `after-empty-mobile.png`, `after-empty-ps-dark.png`, `after-empty-desktop.png`:
  readable zero-data charts.
- `after-print-ps.png`, `inventory-print.pdf`: white-paper printing with long RTL
  records. Print CSS was visually inspected; physical printing was not performed.

Login screenshots are under `tests/artifacts/login-*.png`, including the new 720px
and short-height cases. Artifacts contain synthetic data and are ignored by Git.
The empty-state squeezing and dark print background were found during this review
and corrected; focused regression assertions now cover them.

## Preservation, limits and next phase

A before/after SHA-256 comparison verifies **20 protected files unchanged**,
including every server module, existing SQL migrations, database connection,
localStorage data model, authentication modules, Phase 3B-2 tests and the existing
footer edits. The baseline diff and hash evidence are in the artifact directory.
No production database connection or staff browser profile was used in this phase.
All database writes were confined to the disposable integration clusters. The
backend's exact arithmetic, transactions, row locks, receipts, movement history,
operation UUID behavior, sessions and CSRF remain unchanged and passing.

No known original regression remains. The tested layouts and workflows are ready
for review before **Phase 3B-3 — Frontend PostgreSQL Integration**. No integration
work has begun. Browser-local records are still browser-local; backups retain their
existing format. No new manual migration or package installation is required.

Remaining manual verification: fluent Pashto wording review, actual screen-reader
speech/navigation (NVDA/JAWS/VoiceOver), physical mobile keyboards/devices,
Firefox/Safari, real printer output and university LAN deployment. The performed
checks support WCAG 2.2 AA-oriented improvements, not a full conformance
certification. Login retains its existing English wording; bilingual authenticated
pages were verified. Production readiness still requires the separately planned
backend integration and deployment review.
