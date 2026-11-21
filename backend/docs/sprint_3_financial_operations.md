# Sprint 3 financial operations and recovery

Run the commands from the backend directory. Use a read-only database identity for inspection and a separately scoped identity for applying approved changes. Keep credentials in the environment/secret store. Record UTC times, aggregate counts, page cursors, exit codes, archive integrity results and the release commit in the incident record.

## Rollout and legacy migration

1. Quiesce financial writes and workers. Record the release commit, active flags, database identity and backup recovery point. Take a recoverable backup before applying the migration.
2. Run `npm run ops:preflight`. It counts conflicting identifiers under the financial models' actual unique-index filters, unsafe amounts and broken ledger/payment/payout references. Inspect affected groups privately. Preserve original financial evidence.
3. Run `npm run ops:indexes` to inspect model index definitions. Review missing definitions and capacity, then run `npm run ops:indexes -- --apply`. It creates missing indexes after preflight. A conflicting definition needs a separate reviewed index rollout. Existing names and data are preserved. Repeat until missingBefore is zero.
4. Run `npm run migrate:sales -- --limit 100`. Repeat with `--after <nextAfter>` to scan the next page. Review counters for the entire scan. Missing instructor identities require manual account reconciliation.
5. Repeat from the first page with `--apply`. Each sale commits independently under the instructor finance guard. Persist the cursor only after a complete page. On interruption replay the last page. A verified sale gets its original refund deadline as eligibleAt. Unsupported or inconsistent evidence gets a financial hold. A migration never grants payout eligibility. Use the existing eligibility worker for that decision.
6. Repeat dry-run after apply. Expect zero dates to backfill and account for every outstanding review. Restore normal operation after the operational owner signs off. Exit 1 means an incomplete operation. Exit 2 means the report contains a blocking or unresolved condition. A non-null nextAfter always requires another page.

An application rollback requires a version that reads every persisted status and continues processing accepted events. Pause new admissions during investigation. If the older binary cannot interpret refunds, payouts or published revisions, keep the compatible worker version and roll forward a fix. A database rewind requires the external reconciliation below.

## Health and incidents

`GET /api/v1/health` reports process liveness. `npm run ops:readiness` checks replica-set or mongos topology, writable primary and a snapshot read through the configured database. A process can answer HTTP while database admission is unavailable.

Run `npm run staging:status -- --execute` from an operator environment to inspect queue counts, oldest receipt ages, refund review backlog, pending payouts and exhausted cleanup jobs. Compare successive samples to distinguish an old backlog from rising arrivals. Page the deployment owner on lost readiness, exhausted cleanup, growing failed receipts or an unresolved financial outcome. The deployment owner records actual thresholds, sampling interval and incident contacts before staging acceptance.

| Incident | Operator action | Release condition |
| --- | --- | --- |
| Refund outcome unknown | Keep the hold. Use `npm run refunds:reconcile -- --refund-id <id> --execute` to retrieve trusted evidence with issuance disabled. Match provider identity, currency and amount. | Reviewed provider outcome is committed and the corresponding hold is reconciled. |
| Manual transfer unknown | Freeze the reserved entries. Compare the sealed attempt and transfer reference with the external transfer register. Use the existing admin payout reconciliation operation with dated evidence. | Confirmed paid or confirmed not sent. An ambiguous attempt stays reserved. |
| Webhook backlog or process restart | Inspect ages and expired leases. Restore connectivity and start a compatible worker. Replay an identified durable receipt through `payments:events` only after inspection. Preserve existing idempotency keys. | Backlog drains and balances, enrollments and audit histories reconcile. |
| Primary unavailable | Remove the instance from ready traffic. Let the replica set recover, then rerun readiness and inspect pending leases. | A snapshot read succeeds on the writable topology and durable jobs resume. |

## Backup, restore and independent reconciliation

Use encrypted, access-controlled point-in-time backups for deployed environments. Record the backup ID, recovery point, database/tool versions and checksum. For a logical single-database dump, stop **all** writers for the complete dump and source-manifest capture, including workers, webhooks and administrative jobs. For continuous writes use a consistent managed snapshot/PITR mechanism. Keep archives and credentials out of source control and handoff files.

For a quiesced logical backup, the following PowerShell commands use protected Database Tools config files containing connection settings. Supply an empty destination, an access-controlled archive path, and database names assigned for this recovery. Compare the checksum with the independently recorded backup checksum before restore.

```powershell
mongodump --config="$env:SOURCE_TOOLS_CONFIG" --db="$env:SOURCE_DB" --archive="$env:BACKUP_ARCHIVE" --gzip
Get-FileHash -Algorithm SHA256 -LiteralPath $env:BACKUP_ARCHIVE
mongorestore --config="$env:RECOVERY_TOOLS_CONFIG" --archive="$env:BACKUP_ARCHIVE" --gzip --stopOnError --nsInclude="$env:SOURCE_DB.*" --nsFrom="$env:SOURCE_DB.*" --nsTo="$env:RESTORE_DB.*"
```

1. Restore into a new isolated database ending in `_restore`, with application ingress and workers disabled. Confirm the destination is empty and belongs to this rehearsal. Bind a read-only credential to that database for reconciliation.
2. Compare each restored collection count, BSON content digest in stable primary-key order, and index definitions to the matching recovery-point manifest. Independently check order/payment snapshots, pending receipts, reserved earnings, holds and sealed payout attempts.
3. Configure `RESTORE_MONGO_URI` and the matching Stripe **test** environment. Run `npm run restore:check -- --limit 100` and follow every nextAfter. The checker uses provider reads. It compares checkout identity and paid amount with the restored order/payment, and compares Stripe refund observations with restored refunds. Unknown or nonterminal records need manual review. The report includes the number of payout records to compare.
4. Export provider-side transactions, refunds, disputes and events covering the recovery point through the cutover. Match in both directions, including payments created **after** the backup that have no local row. Reconcile manual transfers against the external settlement register for the same interval. Page-level matches cannot establish completeness for this interval.
5. Rebuild missing local records/receipts via the existing controlled recovery procedures, inspect all differences, verify final balances/access and obtain dated sign-off before bringing a replacement database into service. Never use a second refund request or transfer to discover what happened. Record measured recovery-point loss and elapsed restore/cutover time. The operator owns deployment-specific backup cadence, retention, RPO and RTO.

### Repeatable local rehearsal

Start the local replica set with `npm run mongo:local`. Install MongoDB Database Tools on PATH or set `MONGO_TOOLS_DIR` to their bin directory. Run `npm run restore:drill`. It generates disposable synthetic orders, payments and a durable receipt in a newly named local database, writes a temporary gzip archive with mongodump, restores into a distinct database with mongorestore, compares sorted BSON digests, counts and fixture indexes, and removes the generated resources. The fixture includes a BSON Long and a compound unique index.

An empty-database index rollout proposed and created 56 indexes. The second apply created zero. The local S3-15 rehearsal restored three documents across three collections with matching snapshots and indexes. A simulated Stripe refund issued after the recovery point was flagged against the restored database; its financial records were unchanged. Independent regression tests cover interrupted/resumed migration, ambiguous provider outcomes, stale backups, worker lease recovery, bounded shutdown and an unreachable replica set. Real Stripe account reconciliation, external settlement evidence and measured staging recovery objectives are staging acceptance work.
