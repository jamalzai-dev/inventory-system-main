# PostgreSQL backup and recovery

This procedure is prepared for the current Windows/Node/PostgreSQL installation.
Nothing schedules a task, changes credentials or restores production automatically.
Browser JSON export is a convenience report, not a database backup.

## What is saved

Use PostgreSQL custom-format `pg_dump`. It includes schema, constraints, categories,
suppliers, materials, exact balances, archive state (when installed), movements,
operation UUIDs and creation receipts. Admin password hashes are included because
history references the Admin record. Treat the entire archive as confidential.
Session table structure is included; live session rows are deliberately excluded.
Cluster roles, role passwords, `.env`, TLS certificates and application source are
separate recovery items. Keep their approved configuration in protected storage.

## First-time setup, by the administrator

1. Choose a protected backup folder outside the served project, for example
   `D:\KDRU-Backups`. Limit its Windows permissions to the approved backup operator
   and system administrators. Node's Unix file mode is not a Windows ACL policy.
2. Configure a dedicated backup account with read access to every required table
   and schema. It does not need application write or server-admin rights for a dump.
   Have the database administrator review its grants.
3. Put its connection secret in a protected PostgreSQL password file. Use
   `PGPASSFILE` to select that file; do not put passwords in commands or source.
   Confirm the file is readable only by the backup account and administrators.
4. Use the installed PostgreSQL 18 tools. Keep the same major version for rehearsals.

## Create and inspect a backup

From the project directory, after the above setup (replace the account/path):

```powershell
$env:PGPASSFILE='D:\ProtectedConfig\inventory-backup.pgpass'
node tools/backup-database.mjs 'C:\Program Files\PostgreSQL\18\bin' 'D:\KDRU-Backups' university_inventory inventory_backup 5432
```

This is a read-only database operation, run manually by you. The script creates a
unique `.partial` file, dumps the database, inspects its table-of-contents with
`pg_restore --list`, checks required table data/session exclusion, then renames it
to `.dump` and writes a `.sha256` sidecar. A failure exits nonzero. A `.partial`
file is never a completed backup. No older files are overwritten or deleted.
If sidecar writing fails, the command fails even if the dump was completed; inspect
it before use. Readability and a checksum do not prove a successful restoration.

Inspect a particular completed archive without restoring it:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --list 'D:\KDRU-Backups\SELECTED-ARCHIVE.dump'
Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\KDRU-Backups\SELECTED-ARCHIVE.dump'
Get-Content -LiteralPath 'D:\KDRU-Backups\SELECTED-ARCHIVE.dump.sha256'
```

Compare the full hashes before recovery. `pg_verifybackup` applies to physical
base backups, not ordinary `pg_dump` archives; do not use it here.

## Schedule and storage recommendation

After a successful supervised restore rehearsal, arrange daily backups and an
extra backup before migrations. Suggested retention: 14 daily, 8 weekly and 12
monthly versions, adjusted to university policy and capacity. Review failures every
working day. No scheduler or automatic deletion was configured by this phase.
Copy completed archives and checksum files to encrypted, access-controlled storage
on another computer/device. Keep one disconnected or immutable copy. A second
folder on the same disk is not protection against disk failure or ransomware.
Delete expired versions only after checking a newer verified off-computer copy.
Rehearse restoration monthly and after database/schema/application upgrades.

## Restore rehearsal

Only an approved administrator restores databases. Use a separately initialized
disposable PostgreSQL instance, never the production instance as an experiment.
The example port below must belong to that verified test instance.

```powershell
$pgBin='C:\Program Files\PostgreSQL\18\bin'
$restorePort='55432' # Your separately verified disposable PostgreSQL instance.
$restoreDb='inventory_restore_rehearsal_20261031' # Must not already exist.
& "$pgBin\psql.exe" --host=127.0.0.1 --port=$restorePort --username=test_owner --dbname=postgres --command='SELECT current_database(), inet_server_port();'
& "$pgBin\createdb.exe" --host=127.0.0.1 --port=$restorePort --username=test_owner $restoreDb
```

Check each exit code before continuing. On this test cluster, create any referenced
roles (including `inventory_app`) with reviewed least privileges and no production
passwords. `--no-owner` makes the restoring test owner own the objects; grants still
reference roles. Do not grant the application superuser access to fix grant errors.

```powershell
& "$pgBin\pg_restore.exe" --host=127.0.0.1 --port=$restorePort --username=test_owner --dbname=$restoreDb --no-owner --exit-on-error --single-transaction 'D:\KDRU-Backups\SELECTED-ARCHIVE.dump'
```

Do not use `--clean`, `--create` or `university_inventory` in a rehearsal. Restore
only trusted archives: SQL and functions inside an archive execute on restoration.
Verify counts of all inventory/history/receipt tables against the backup-time
record, sampled decimal balances, category/supplier relationships, movement UUIDs,
foreign keys and archive state. Session count should be zero. Log in with approved
test credentials and test reads and one synthetic stock operation in this test
database. A restored Admin hash must not be exposed or replaced without approval.

The automated synthetic rehearsal can be rerun safely:

```powershell
$env:TEST_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
node --test tests/backup-postgres.test.js
```

It creates its own cluster and a second empty database, checks contents, verifies
same-UUID replay/creation receipts and exercises the actual Express read API.
It does not read your `.env` or restore a real university archive.

## Actual disaster recovery

Stop staff writes and obtain supervisor authorization. Preserve the failed server
and any newer evidence. Verify the selected archive on a separate instance first.
An administrator must plan the new production database/roles, reviewed grants,
application connection configuration and rollback. Do not overwrite the old live
database. Invalidate all old sessions with a new approved session secret, and review
Admin credentials with the owner. Install the matching application source, verify
backup-time balances/history and user access, then supervise reopening to staff.
Record the recovery point and any transactions that must be reconciled manually.

Tool reference: [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)
and [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
