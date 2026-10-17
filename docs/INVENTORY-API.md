# Phase 3A: authenticated PostgreSQL inventory reads

The Express server now reads inventory through the existing PostgreSQL pool.
The browser still uses `app/data.js` and `university_it_inventory_v2` localStorage.
No frontend code, authentication policy, inventory records, or database schema was
changed. Browser dummy data is not migrated. PostgreSQL inventory starts empty.

## HTTP contract

Every endpoint requires the existing shared Admin session. They are mounted after
the same authentication middleware as protected pages, including its credential
version check. Login/logout, CSRF, password hashing and session settings are unchanged.
Use the session cookie obtained through the existing login flow. Responses have
`Cache-Control: no-store`; no inventory route is public.

| GET endpoint | 200 JSON |
| --- | --- |
| `/api/categories` | `{ "data": [category, ...] }` |
| `/api/suppliers` | `{ "data": [supplier, ...] }` |
| `/api/materials` | `{ "data": [material, ...] }` |
| `/api/materials/:id` | `{ "data": material }` |

Lists use a fixed `ORDER BY name, id` and return `{ "data": [] }` when empty.
Filtering, client-selected ordering and pagination are not implemented; query
parameters are ignored. Lists currently return all records. Express also provides
its normal HEAD behavior for these GET handlers. No write methods were added.

Errors use the existing `{ "error": "message" }` convention:

| HTTP status | Message |
| --- | --- |
| 401 | `Authentication required.` |
| 400 | `Invalid material ID.` |
| 404 | `Material not found.` |
| 503 | `Service temporarily unavailable.` |

Material IDs must be 36-character hyphenated UUIDs, case insensitive, with any UUID
version accepted. Invalid IDs are rejected before an inventory query; absent valid
IDs produce 404. Authentication runs before ID validation. Unsupported authenticated
API paths/methods retain the existing 404 `Not found.` response.

Queries explicitly select inventory fields. The lookup binds `$1::uuid`; SQL
identifiers and ordering are server constants. Database errors are logged with a
fixed diagnostic and returned without driver messages, connection details or SQL.
Admin hashes and session records are never included in inventory responses.

## API and frontend mapping

API field names intentionally match familiar frontend names, but the API's **types
and nullability are not compatible with the current localStorage validator**.
Do not pass these records into the current repository or backup restore unchanged.
No adapter or API integration is introduced in this phase.

All three record types contain:

| PostgreSQL | API / current frontend name | API representation |
| --- | --- | --- |
| `id` | `id` | UUID string |
| `name` | `name` | String |
| `description` | `description` | String or null |
| `created_at` | `createdAt` | UTC ISO timestamp string |
| `updated_at` | `updatedAt` | UTC ISO timestamp string |

Suppliers additionally contain `contact`, `phone`, `email`, and `address`, each
with the same name and a string-or-null value.

Materials additionally contain:

| PostgreSQL | API / current frontend name | API representation |
| --- | --- | --- |
| `category_id` | `categoryId` | Required UUID string |
| `current_stock` | `quantity` | Exact decimal string, including zero |
| `reorder_level` | `reorderLevel` | Exact decimal string or null |
| `supplier_id` | `supplierId` | UUID string or null |
| `unit` | `unit` | String or null |
| `serial_number` | `serial` | String or null |
| `location` | `location` | String or null |
| `condition` | `condition` | String or null |
| `price` | `price` | Exact decimal string or null |
| `purchase_date` | `purchaseDate` | `YYYY-MM-DD` string or null |
| `responsible_person` | `responsible` | String or null |

NUMERIC/domain columns are explicitly selected as text, retaining PostgreSQL's
exact representation and scale. There is no Number/parseFloat conversion, rounding,
or null-to-zero coercion. Dates are formatted in SQL so JavaScript timezone
conversion cannot shift a calendar date. Timestamps retain pg's existing Date
handling and serialize to UTC ISO strings with millisecond precision (submillisecond
PostgreSQL timestamp precision is not exposed).

Current frontend constraints that need an explicit Phase 3B decision:

- `app/data.js` requires numeric JavaScript `quantity`, `reorderLevel`, and `price`,
  and restricts quantities/reorder levels to integers. PostgreSQL allows fractional
  stock; a future integration needs deliberate decimal validation and arithmetic.
- The frontend requires location and one of `Good`, `Needs Repair`, or `Damaged`;
  PostgreSQL permits null location/condition and unconstrained condition text.
- Optional frontend text/date fields use strings or omission; nullable API fields
  must retain their meaning through a future adapter. A null supplier must not be
  silently treated as an existing relationship.
- The dashboard classifies stock using numeric equality/comparisons and sorts
  quantities numerically. Reports and printing multiply quantity by price. Global
  search joins categories/suppliers by ID and reads serial/responsible fields.
  Reusing names alone does not make these consumers decimal-safe.

## Live schema findings (2026-10-18)

Inspected PostgreSQL `university_inventory` as the configured `inventory_app` role,
using catalog reads and read-only queries. The only committed migration before
this phase was `002-inventory-sessions.sql`; the inventory definitions were already
installed in the database. The live schema, rather than historical deployment
proposals, was used to select the API fields.

- Categories, suppliers, materials and stock movements use UUID primary keys with
  `gen_random_uuid()` defaults. All have non-null `created_at` timestamps; categories,
  suppliers and materials also have non-null `updated_at`, defaulting to the current
  timestamp. These timestamps are `timestamptz`.
- Categories require `id`, `name`, `created_at`, `updated_at`. Suppliers have the same
  required columns. All their other exposed fields are nullable.
- Materials require `id`, `name`, `category_id`, `current_stock`, `created_at`,
  `updated_at`. Other material fields are nullable. Stock defaults to zero.
- Material category references use `ON DELETE RESTRICT`; supplier references use
  `ON DELETE SET NULL`. Stock movement material/Admin references use RESTRICT.
- `current_stock` and `reorder_level` use the NUMERIC-based `stock_amount` domain:
  0 through 999999999.999, with at most three fractional places. `price` uses
  `price_amount`: 0 through 999999999.99, with at most two fractional places.
  Domains enforce scale through checks, not NUMERIC precision/scale declarations.
- Stock movements require material, nonzero quantity delta, Admin (default 1),
  operation UUID, and timestamp. A check bounds the signed delta and limits it to
  three fractional places; `(operation_id, material_id)` is unique. No movement API
  or mutation is part of Phase 3A.
- Existing indexes include all primary keys, unique normalized category/supplier
  names, a partial unique normalized material serial, material category/supplier
  foreign-key indexes, and movement material/date and operation/material indexes.
  Session expiry is indexed. No new index is needed for these simple reads.
- `inventory_app` has public-schema USAGE and SELECT on all inventory tables. It is
  neither superuser nor BYPASSRLS; inspected tables have RLS disabled. The existing
  role also has INSERT/UPDATE/DELETE privileges. Those grants were not changed;
  read-only here describes the new API/repository, not a database-wide role restriction.
- Categories, suppliers, materials and stock movements were all empty before and
  after live verification. No inventory or account writes, seeds or schema changes
  were executed.

No schema correction or missing read permission was found, so **no SQL migration
or new environment configuration is required**. Differences from the browser model
are documented above and do not require changing the database for read APIs.

## Verification and Phase 3B boundary

Run `npm test` for all automated tests, including `tests/inventory.test.js`.
The API tests use synthetic rows, synthetic Admin credentials, an in-memory session
store and a mock query interface; they never access production records.

Executed on 2026-10-18:

| Check | Actual result |
| --- | --- |
| Baseline `npm test` | 54 passed, 0 failed |
| Updated `npm test` | 65 passed, 0 failed, 0 skipped (11 new API/repository tests) |
| `node --test tests/repository.test.js` after documentation changes | 3 passed |
| `npm run check:db` | Connection successful |
| Live inventory repository + HTTP reads | Passed using `inventory_app` in `BEGIN READ ONLY`, with synthetic Admin/in-memory sessions; lists empty, absent UUID 404, invalid UUID 400, unauthenticated 401 |
| Live domain/date SELECT expressions | Exact stock/price strings, NULL numeric and calendar date verified without inserting fixtures |
| Normal `tools/serve.mjs` startup with `PORT=0` | Passed with real PostgreSQL session store; login page 200 and all four inventory endpoints 401 without session cookies |
| `tests/auth-browser.mjs` | 7 checks passed |
| `tests/redesign-browser.mjs` | 9 checks passed |
| `tests/browser.mjs` | 13 checks passed, then failed at line 108: page overflow at 768px, English/light Materials |
| `tests/redesign-edge-browser.mjs` | 6 checks passed, then failed at line 99: document overflow in the 720px/200%-layout check |
| `tests/stock-print-browser.mjs` | 6 checks passed, then failed at line 67: document overflow in the width/language/theme matrix |
| `git diff --check` | Passed |

Browser suites used the installed Edge/Playwright runtime and the existing
`tests/helpers/disposable-browser.mjs` runner, with disposable profiles, synthetic
credentials, and browser-local fixtures. All three layout failures reproduced at
the same assertions in an isolated archive of unchanged baseline commit `a92a3b0`.
They predate Phase 3A; no UI fixes were made. Checks after each failed assertion did
not run. `tests/qa-browser.mjs` was not run in this phase.

The real shared Admin password was not used or changed. A full live Admin
login/logout with PostgreSQL session writes was not performed; login/logout was
verified with the existing synthetic authentication fixture. No production records
were modified. Frontend, translations, dashboard/search/report code, CSS, login
assets, PWA files, dependencies, and `app/config/db.js` have no changes.

Phase 3B remains unimplemented: decimal-safe frontend/API integration, deliberate
null handling and validation, and separately authorized transactional inventory
writes/stock movements. Browser dummy data does not need migration. Backup/restore
replacement, deployment, UI changes and PWA work are also outside this phase.
