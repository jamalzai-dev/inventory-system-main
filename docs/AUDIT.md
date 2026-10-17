# Audit and implementation decisions

## Stage A — 11 October 2026

Reviewed the root pages, both JavaScript implementations, both stylesheets/theme mechanisms, README, and asset inventory. No package manifest, backend, tests, repository metadata or AGENTS.md was present.

**Foundation:** retain the vanilla-JavaScript `index.html` application's data model and `university_it_inventory_v2` key. Split presentation, translations, validation and persistence into modules. No framework or backend migration is needed.

The original single-page application supports materials, categories, suppliers, stock thresholds, locations, equipment condition, serials, responsible people, AFN valuation, printing and JSON backups. Its translations cover only navigation; dialogs have no focus management; dark mode leaves white controls; IDs are interpolated into executable event attributes; restore only checks two truthy properties; corrupt JSON prevents startup; edits mutate memory before persistence succeeds; rendering filters resets open-form selections; clearing data recreates seeded categories.

The Bootstrap implementation uses six independent `ims_*` collections. It adds purchase orders, receipt-driven stock changes, adjustments and logs, but lacks equipment metadata. Individual empty collections invoke a seed routine that overwrites every collection. Other risks include English-only validation rejecting Unicode, HTML interpolation of stored text, relationship deletion, sequential non-atomic stock/order/log writes, repeat receipt risk, ID reuse after deletion, stale stock snapshots, inconsistent filtering and empty pagination. It depends on external CDN assets and prices represent EGP, not AFN. The dashboard module is orphaned from the replacement index.

## Stages B–C — protection and refactoring plan

1. Keep original sources in `archive/` for reference. Retire legacy executable entry pages in favor of links to the supported application. Keep all `ims_*` storage keys untouched; provide safe read-only inspection and raw export in Backup. Disable legacy seed/writes so stale entry points cannot overwrite records. Purchase orders, adjustments and logs remain separate historical records; no stock replay or currency conversion.
2. Retain the v2 data shape. Validate complete collections, IDs, references and numeric values before writing. Invalid existing storage enters recovery mode, preserving raw bytes and blocking ordinary writes. Do not repair missing values by guessing.
3. Take a raw recovery snapshot before every inventory write, use one atomic localStorage write for the application state, and only then replace in-memory state. Abort if snapshot or primary write fails. Detect stale tabs before saving. Browser storage is not a database transaction service; simultaneous cross-device use is unsupported.
4. Validate restore before confirmation; summarize incoming record counts. Snapshot the current raw dataset before replacement. Keep settings local. Provide both portable inventory backup and raw storage archive downloads.
5. Use centralized English/Pashto dictionary, native modal dialogs, logical CSS and semantic light/dark tokens. Preserve entered text and form drafts during language/theme changes.

No destructive automatic data migration is planned. See MIGRATION.md for the manual legacy mapping and DEPLOYMENT.md for future server work.
