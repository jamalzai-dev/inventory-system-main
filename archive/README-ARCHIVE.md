# Reference source only

These files preserve the two original implementations before modernization.
The database helper has one deliberate safety change: seed is a no-op, and writes/clear throw instead of modifying legacy storage.

Do not run or deploy this directory. It contains obsolete rendering/validation patterns and CDN dependencies. The supported implementation is ../index.html plus ../app/. The supplied preview server excludes this directory.

User data was never stored in these files. Legacy browser storage remains under its original ims_* keys. Use the supported application's Backup & restore page for safe read-only inspection and raw exports.
