# How the system works

The browser displays HTML/CSS and vanilla JavaScript. `app/api.js` sends authenticated
requests to Express; it never connects directly to PostgreSQL. `app/store.js` keeps
the current view in memory and refreshes it from the server. PostgreSQL is the only
inventory authority. Three staff computers see the same records after refreshing.

Express authenticates the shared Admin with bcrypt and stores sessions in PostgreSQL.
Cookies are HttpOnly/SameSite, and HTTPS configuration enables Secure. Mutations
need the current CSRF token. Queries use parameters, and the static file allowlist
excludes `.env`, database code, tests, tools and archived sources.

Stock uses one `POST /api/stock-operations` for a single material or batch. The server
locks material rows in a consistent order, checks exact decimal amounts, updates
balances and inserts history in one transaction. Operation UUIDs prevent duplicate
effects. Metadata uses version checks to reject stale edits. No JavaScript/localStorage
stock system runs alongside the database.

`app/stock-input.js` translates keyboard numerals to exact ASCII decimal strings for
the API and calculates the preview using BigInt. The preview is not a reservation.
The final server balance wins when another client changes stock.

The optional archive column is introduced only by manually reviewed migration 004.
Without it the old schema works and archiving is unavailable. With it, the separate
versioned archive endpoint permits only zero-stock records. No relationships or
history are deleted. Active dashboard/search/report views omit archived records;
the Materials archive filter and global movement history retain access.

The service worker stores only six explicitly public offline resources. It does
not cache inventory HTML, API responses, credentials, CSRF tokens, reports or
transactions. Unfinished POST requests use the existing tab-scoped retry journal;
that is not an offline mutation queue. PWA updates do not force another tab to reload.

Files to start with: `app/main.js` (screens), `app/i18n.js` (English/Pashto),
`server/app.js` (security/serving), `server/inventory.js` (reads),
`server/inventory-writes.js` (metadata), `server/stock.js` (stock),
`server/material-archive.js` (optional archive), `tools/backup-database.mjs` (backup).
