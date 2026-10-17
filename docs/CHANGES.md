# Delivered changes

- **Rebuilt:** index.html as a small document shell; seven legacy HTML URLs as compatibility redirects; js/db.js as a read-only compatibility guard; README.md.
- **Added application modules:** app/data.js (validation, immutable operations, persistence/recovery), app/i18n.js (adjacent English/Pashto dictionary and formatting), app/ui.js (safe DOM components), app/main.js (navigation, reports, CRUD, backup workflows), app/preferences.js (pre-paint theme/language), app/start.js (HTTP startup and direct-file export recovery), app/styles.css (semantic themes and responsive RTL layout).
- **Added local tooling:** package.json, tools/serve.mjs, tests/data.test.js, tests/browser.mjs, .gitignore. No production dependencies or build step.
- **Added PWA preparation:** manifest.webmanifest, assets/inventory.svg, unregistered service-worker.js shell-cache draft.
- **Added documentation:** docs/AUDIT.md, MIGRATION.md, DEPLOYMENT.md, TESTING.md, CHANGES.md and archive/README-ARCHIVE.md.
- **Archived:** original index, seven legacy pages, original README, legacy JavaScript/CSS, theme script and images. Removed unused legacy JavaScript (except the guarded db helper), css/style.css, assets/js/color-modes.js and original PNGs from active source paths after verifying their bytes matched the archive copies. Nothing was removed from browser storage.

## Key fixes

Removed automatic sample seeding; guarded legacy writes; reject incomplete/malformed backups, duplicate IDs, orphan references, invalid dates and invalid numbers; block deletion of referenced categories/suppliers; avoid in-memory commits after failed persistence; preserve previous raw storage before writes; detect stale tabs; render all entered/imported strings as text; preserve names/descriptions exactly; avoid executable inline event handlers; eliminate ambiguous EGP/AFN conversion; preserve legacy history without replaying stock movements; retain drafts and selections when changing language or theme.

## UI changes

All supported app text, dynamic statuses, form errors, confirmations, reports, empty states and notifications use the shared bilingual dictionary. The root language/direction switch instantly. User-entered values remain unchanged; mixed-direction values use bdi or explicit LTR fields. Pashto uses Arabic-capable system fonts, expanded line height and adjusted text sizing. Fluent human proofreading remains outstanding.

Light/dark semantic tokens cover all supported components. Sidebar and layout use logical positioning; mobile navigation is a keyboard-operable disclosure. Wide tables retain their columns inside focusable horizontal scroll regions. Native dialogs include explicit Tab wrapping, Escape dismissal and focus restoration. Forms have associated labels, error regions, Unicode-safe checks and touch-sized controls. Reduced-motion and print styles are included.

See TESTING.md for actual verification and remaining limitations.
