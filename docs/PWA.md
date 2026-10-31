# Install, update and remove the app

The name is **KDRU IT Inventory**. The blue box icon is a neutral inventory symbol,
not an official university emblem. The existing official-logo placeholder remains.
The manifest includes 192/512 PNG icons with a safe maskable area and standalone
display mode. Install from Edge/Chrome's address-bar/menu install action when offered.
No extra installer or public account is needed.

## Development and HTTPS

`http://127.0.0.1:8080` and localhost are development secure-context exceptions.
An arbitrary `http://192.168...` address on another computer is not that exception.
Before installing on staff computers, the administrator must configure the approved
LAN hostname and trusted HTTPS. An internal CA's root certificate must be trusted
on each authorized computer through university policy; never teach users to bypass
certificate warnings. This phase does not configure certificates or deploy Nginx.

Target browsers are current Windows Edge/Chrome. Browser policy, private browsing,
platform and browser version affect installation. Firefox/Safari and physical
mobile installation require separate verification. Private profiles cannot install
the app even when all manifest/service-worker criteria pass.

## Offline and private data

On network failure or a 5xx navigation response the worker displays a bilingual
Server Unreachable page with Retry. Retry checks the real authenticated session,
then opens the current inventory or login. The public offline screen contains no
records. An already open application labels its previous data stale and blocks writes.
There are no offline edits, Background Sync or private response caches.

The exact cache allowlist is `/offline.html`, `/offline.css`, `/offline.js`,
`/manifest.webmanifest`, `/assets/icon-192.png`, `/assets/icon-512.png`.
All `/api/*` traffic and all mutations bypass worker response handling. Protected
HTML and application modules remain authenticated/network-only. Public assets may
be fetched without cookies; they contain no staff data. Logout does not need to
delete those harmless assets. A first-ever offline visit cannot install a worker.

## Updates

Publish reviewed source as a coordinated release during a maintenance window.
Bump the worker's `VERSION` when its cached public assets change. The new worker
waits; staff see “A new version is available.” Update refuses to reload while a
form, transaction or uncertain request is open. Other tabs are never forced to reload.
Close forms/resolve pending operations, then select Update. Even without a worker
upgrade, protected application code is fetched from the server on the next load.
Do not replace code on a live server during stock operations.

To uninstall, use the browser's installed-app management. Uninstalling does not
delete PostgreSQL records. Before clearing site data, finish uncertain operations
and export any legacy records at that origin. Site-data clearing destroys browser
preferences, legacy data and tab retry recovery; it is not a routine troubleshooting step.

Reference: [MDN service workers and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).
