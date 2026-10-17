# Data preservation and migration

## Existing single-page records

The supported application still reads/writes **`university_it_inventory_v2`**. Material IDs, names, descriptions, quantities, categories, suppliers, equipment fields, timestamps and unknown extra fields survive normal updates and portable backup round trips. No automatic schema conversion or sample seeding runs. New installations start empty.

Language/theme now persist separately under `university_it_preferences`; the existing settings are used on first load, and current preferences are included in subsequent inventory saves. Restoring inventory preserves the current browser's preferences.

**Keep the same browser profile and origin to see existing records.** Moving from `file://` to an HTTP server, changing port/hostname, or changing browser creates a different storage context. Export the original inventory from its original location before switching. The old HTML source is preserved in `archive/index.html` for reference, but do not run the archive as an application or assume it shares the old file's storage. Open the updated index.html directly at its original file path in the original browser profile: its bilingual export-only recovery screen downloads the existing v2 inventory or all raw storage without running modules or writing records. Then start the HTTP server and restore that portable backup. If the file was moved, return to the exact old path/profile; file-origin storage behavior varies by browser. Previously exported v2 backups remain usable. No real browser inventory was accessed during development; tests use disposable isolated profiles.

## Recovery

- Every inventory mutation validates the complete proposed state, compares the stored raw value with the loaded value, stores the previous raw bytes in `university_it_inventory_v2_recovery`, and then replaces the primary value in one localStorage write.
- If backup or primary persistence fails, the old primary value and the current in-memory records stay unchanged. A successful snapshot followed by a failed primary write can update the recovery slot, but cannot erase the primary data.
- Only the most recent snapshot is retained. Download portable backups regularly; browser clearing removes both inventory and recovery.
- **Backup & restore → Recover previous inventory** previews the latest valid snapshot and requires confirmation before replacement. Download the raw archive before investigating corruption.
- Invalid or incomplete existing data enters recovery mode. No edits or clear operation are allowed; raw export and explicit restore remain available. Missing categories, malformed values or unsupported conditions must be corrected in a copy by the owner, never guessed by the app.
- Portable restore accepts a complete v2 state or the original `{app, version: 2, data}` envelope. It requires all three arrays, unique nonempty IDs, nonempty names, valid relationships, finite nonnegative prices, whole quantities/reorder levels, supported conditions and real dates. Unsupported versions fail closed. User strings remain text, even when containing HTML.

## Legacy Bootstrap records — explicit manual procedure

The `ims_categories`, `ims_suppliers`, `ims_products`, `ims_orders`, `ims_adjustments` and `ims_log` keys are never written by the supported app. Original page URLs lead to supported pages; purchasing/adjustment/log URLs lead to Backup. Original source is kept in `archive/`; legacy writes and sample seeding are disabled there. The local development server refuses to serve this archive.

1. In the **same origin** as the old legacy application, open Backup & restore, inspect the read-only legacy JSON and download the raw storage archive. Keep an unedited copy of every key, including empty/malformed values and soft-deleted suppliers.
2. A staff member must reconcile duplicate IDs, missing references, pending orders and the meanings of old fields. Export the current v2 inventory too. Work on copies outside the live dataset.
3. Prepare a complete v2 JSON inventory, preserving existing IDs or documenting an explicit collision mapping. Categories map `id/name/description`. Suppliers map `id/name/contact/phone/email/address`; retain referenced soft-deleted suppliers or explicitly reassign them. Products map `name/categoryId/supplierId/quantity/reorderLevel`; preserve `sku` as an extra field, not as an invented serial number. Keep source IDs and dates.
4. Confirm the real **location, equipment condition and AFN unit price** for each product. Legacy prices were displayed as **EGP**; copying the same number into AFN is not a conversion. Record an approved exchange rate/date or confirmed purchase cost outside the application. Do not invent equipment metadata. Do not import a product until required facts are confirmed.
5. Keep purchase orders, adjustment history and logs in the original archive. Historical adjustments and received orders are already reflected in stock and **must not be replayed**. Decide pending-order handling with the owner before inventory cutover. These modules have not been migrated into a new purchasing workflow.
6. Use Review backup to validate the prepared file. Inspect counts, relationships, sample records, total units and AFN valuation in a disposable test browser. Only then restore the complete reconciled dataset in the intended browser, after exporting its current data. Restore replaces; it does not merge.

The raw archive format preserves key/value strings and is intentionally not accepted as an inventory restore file. To recover its current v2 record, extract `records.university_it_inventory_v2` unchanged into a JSON file. For its recovery slot, parse `records.university_it_inventory_v2_recovery` and extract `raw`. Both must still pass normal validation. Do not feed `ims_*` values directly into v2 restore.
