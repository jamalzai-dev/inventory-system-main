# Shared Admin authentication (Step 2)

The Express server protects the existing inventory with one shared Admin account.
Inventory records still live in browser-local storage. This step does not migrate
records, alter inventory rules, or add registration, roles or password resets.

## One-time setup on your PostgreSQL machine

1. Run `npm ci` in the project root with Node.js 22 or later.
2. In pgAdmin, connect to **university_inventory** as the PostgreSQL administrator
   and run [002-inventory-sessions.sql](../db/migrations/002-inventory-sessions.sql)
   once. It adds `public.inventory_sessions`, its expiry index, and grants only
   SELECT/INSERT/UPDATE/DELETE to `inventory_app`. It leaves all five existing tables
   intact. The script deliberately fails if the session table already exists;
   do not rerun it over an existing migration. The app never creates tables.
3. Keep the existing private `.env` and its working `PG*` settings. Add the new
   settings shown in [.env.example](../.env.example); do not overwrite your `.env`.
   Generate a session secret privately in PowerShell:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

   Copy that output into `SESSION_SECRET` in your local `.env`. Keep it private,
   stable across server restarts, and separate from the database/Admin passwords.
   Use `NODE_ENV=development`, `PORT=8080`, and `TRUST_PROXY=0` for local HTTP.
   Changing the secret invalidates existing sessions. `.env` remains Git-ignored.
4. Run `npm run check:db` and set the Admin credentials as described below.
5. Run `npm start`, then visit the printed address in your browser. Unauthenticated
   requests redirect to `/login`. A successful login opens the existing inventory.

The session table must exist and be accessible before the server will listen.
For connection failures, check PostgreSQL, the `PG*` values, the selected database,
the migration and its grants. Never grant schema creation to `inventory_app` just
to start the app.

## Set or update the shared Admin credentials

Run the following locally in PowerShell. The password prompt is masked and keeps
the password out of command history; the temporary process variable is removed
afterward. Do not put real Admin passwords into committed files or chat.

```powershell
$env:ADMIN_USERNAME = Read-Host 'Shared Admin username'
$adminSecurePassword = Read-Host 'Shared Admin password' -AsSecureString
$adminPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecurePassword)
try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPointer)
    npm run admin:set
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPointer)
    Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_USERNAME -ErrorAction SilentlyContinue
    $adminSecurePassword.Dispose()
}
```

Choose a username of 1–100 characters without surrounding spaces and a password
of at least 12 characters, at most 72 UTF-8 bytes (bcrypt's limit). The utility
uses the existing database module, hashes with bcrypt cost 12, and performs a
parameterized upsert for `id = 1`. Your existing singleton constraint and
`admin_account_set_updated_at` trigger are preserved. No default Admin is seeded.
Changing either credential invalidates old sessions on their next protected
request. Run the same utility for future credential changes.

## Login, logout and sessions

- `/login`, `/login/login.css`, and `/login/login.js` are public. The blank logo
  container in `login.html` is reserved for the future official logo.
- `GET /api/auth/csrf` initializes a session-bound CSRF token; the login page handles
  this automatically. Login and logout POST requests must send `X-CSRF-Token`.
- `POST /api/auth/login` compares the shared username and bcrypt password hash and
  regenerates the session ID. Wrong usernames/passwords receive the same response.
  Ten failed attempts per client IP in 15 minutes trigger throttling. The limiter
  is process-local and resets on restart; run one application process for this stage.
- Sessions are stored in PostgreSQL, persist across server restarts, and have an
  eight-hour sliding expiry. Cookies are HttpOnly, SameSite=Lax, and Secure when
  HTTPS is configured. The visible app checks the session periodically and on focus;
  server requests always enforce authentication independently of those UI checks.
- The **Sign out** control sends `POST /api/auth/logout`, deletes the server session
  and clears the cookie. `GET /api/auth/session` returns 200 for a valid session or
  JSON 401 when unauthenticated. Other protected `/api/*` requests also return 401.
- All inventory HTML, JavaScript, styles, icons and manifest/service-worker files
  require authentication. The original explicit file allowlist is preserved;
  database modules, server code, SQL, `.env`, tests and package files return 404.

Signing out does not erase inventory or encrypt browser storage. Existing records
remain associated with the same browser profile and origin. Keep the original port
to preserve access to them. A later step will move inventory into PostgreSQL.

## HTTPS behind Nginx

For intranet production, terminate HTTPS at a same-host Nginx proxy and set:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://inventory.example.edu
TRUST_PROXY=1
```

Replace the example origin with the real public HTTPS origin. Express remains
bound to `127.0.0.1`; it trusts forwarded headers only from a loopback proxy when
explicitly enabled. Configure Nginx to overwrite `Host`, `X-Forwarded-Proto`, and
`X-Forwarded-For` with the actual request values, proxy **all** app paths to Express,
and disable proxy caching for this app. Do not serve the checkout directly from
Nginx: that would bypass authentication and the file allowlist. The production
server requires an HTTPS origin and uses Secure cookies; plain HTTP is for local
development only. PostgreSQL remains on same-host loopback with SSL disabled.

## Verification

`npm test` covers configuration, generic login failures, valid login, session
rotation, logout, expiry, credential invalidation, CSRF rejection, throttling,
failed session storage, HTTPS cookies and private-file exclusions, alongside the
existing inventory tests. Its test-only fixture uses synthetic credentials and an
in-memory session store; `npm start` always uses PostgreSQL.

Browser suites now log in through the real authentication endpoints. Set
`TEST_ADMIN_USERNAME` and `TEST_ADMIN_PASSWORD` privately in your terminal, along
with `PLAYWRIGHT_MODULE`/`BROWSER_CHANNEL` as needed, then run:

```powershell
npm run test:auth:browser
npm run test:browser
npm run test:qa
node tests/stock-print-browser.mjs
```

Use the same masked-password technique above for `TEST_ADMIN_PASSWORD` and remove
the variables afterward. Set `TEST_BASE_URL` if the server uses another port.
Browser tests use disposable profiles and synthetic inventory. Screenshots and
results are written to the Git-ignored `tests/artifacts` directory. No real
inventory is seeded into PostgreSQL.
