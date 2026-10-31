# Supervised university LAN deployment checklist

This is preparation, not a deployment performed by the coding agent. The working
installation is Windows; confirm the final server OS before preparing its service,
reverse-proxy and scheduled-task configuration.

1. Assign an administrator, a server computer with protected storage, reliable power,
   recovery access and an approved fixed LAN IP/DNS hostname. Record Node/PostgreSQL
   versions and the approved source release. No production demo records.
2. Verify schema/migrations and least privileges. PostgreSQL must listen on loopback;
   only the Node/backup operators connect. Application access needs SELECT/INSERT/UPDATE/
   DELETE on metadata, SELECT/INSERT on history and creation receipts, SELECT on Admin,
   and session-table CRUD. Review existing grants rather than blindly executing a
   blanket GRANT. Runtime must not be superuser, table owner or have DDL powers.
3. Review/apply optional archive migration 004 only after backup/rehearsal and approval.
4. Configure a supervised Node service/restart policy for the chosen OS. Express
   remains bound to `127.0.0.1`; do not change it to all interfaces as a shortcut.
5. Put a reviewed Nginx/reverse-proxy configuration on the same host. Restrict its
   HTTPS port to the approved university LAN/VPN. Do not serve the project directory
   directly or bypass Express authentication for protected HTML/modules. Do not cache
   `/api`, protected pages or login responses. Public worker/manifest/icons/offline
   assets must be accessible as implemented. Forward the correct host/protocol.
6. Obtain an approved hostname certificate from the university internal CA and
   install the CA trust on all authorized clients. Verify the hostname, expiry and
   chain without certificate-warning bypasses. Keep private keys access-controlled.
7. Set `NODE_ENV=production`, `APP_ORIGIN=https://approved-inventory-hostname`,
   `TRUST_PROXY=1` only for the same-host trusted proxy, and a strong protected
   SESSION_SECRET. Confirm Secure/HttpOnly/SameSite cookies, login/logout, CSRF,
   session expiry and no-store responses through the real proxy. Do not put secrets
   into commands, screenshots or a checked-in config.
8. Firewall: allow only the approved HTTPS path; deny direct LAN access to Node and
   PostgreSQL ports. Test unauthorized access and confirm sensitive source paths 404.
9. Establish daily backup monitoring, protected retention, off-computer copies and
   a successful restoration rehearsal. Review Admin/session recovery separately.
10. On three **physical** staff computers, sign in independently and verify: A creates
    a material; B/C refresh and see it; A adds stock; B removes some; C sees the result.
    In a supervised synthetic dataset, test concurrent deductions and stale edits,
    supplier changes and category restrictions. Confirm no negative stock or lost edits.
11. Disconnect one client's network during a synthetic operation, resolve the same
    pending UUID after reconnecting, and verify one effect/history entry. Test real
    session expiry. Never use valuable live quantities as a connectivity experiment.
12. Install the PWA on approved profiles. Test offline fallback, authenticated
    reconnection, logout and an update with another tab's draft open. Confirm no
    private response caching. Verify browser policy and physical mobile/accessibility
    needs; automated viewport testing is not physical device certification.
13. Reboot the server during a maintenance rehearsal; verify PostgreSQL, application,
    proxy, certificate, backups and monitoring recover. Confirm a rollback plan and
    staff guide before supervisor sign-off.

No firewall, Nginx, certificate, scheduled task, production migration, credential
rotation or production service configuration was applied during development.
