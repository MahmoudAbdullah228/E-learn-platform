# S3-03 — Administrative users and account status

Date: 2026-11-18. Branch: `feature/sprint-3-mvp-closure`.
Scope: admin directory/detail and audited suspension/reactivation. This Story does not add
role assignment, user deletion, financial processing or course archiving. Public contract:
[OpenAPI 1.1.0](openapi.yaml). Client integration: [frontend handoff](frontend-handoff.md).

## Models and indexes

- User: hidden `statusRevision` (safe integer, default 0), `statusChangedAt/statusChangedBy`
  and an internal safe-integer `adminActionRevision`. Existing records without the status
  revision are read as zero and updated with a missing-or-zero compare-and-swap filter.
- User directory indexes: `(createdAt desc,_id desc)`, `(status,createdAt desc,_id desc)`
  and `(roles,status,createdAt desc,_id desc)` in addition to existing email/reset indexes.
  Case-insensitive prefix search is escaped and time-bounded; these indexes do not promise
  indexed arbitrary case-insensitive search. Measure representative Staging plans under load.
- RefreshSession: hidden `adminActionRevision` fences a current admin device against
  logout/revocation. Added `account_status_changed` reason for activation cleanup;
  suspension retains the existing `account_suspended` reason.
- AdminSecurityState: singleton `_id=admin-users`, safe revision, protected identity/no
  ordinary hard deletion. It stores no cached admin count and no unbounded history array.
- AdminAuditEvent: reuses S3-02 append-only history with `user.status_changed`, actor,
  target, from/to status, reason and server request ID. No raw account/session document.
- Startup initializes User and AdminSecurityState indexes before HTTP starts. No data
  migration/seed or active policy is run at startup; no index is dropped or synchronized away.

## Validation / HTTP adapters

`modules/adminUsers` contains separate Zod schemas, presenter, cursor helper, policy,
service, controller and routes. Controllers only translate validated requests/results.

| Operation | Input | Success |
| --- | --- | --- |
| GET `/api/v1/admin/users` | optional q/role/status/cursor/limit | `{data:{users,pagination:{nextCursor,hasMore}}}` |
| GET `/api/v1/admin/users/:userId` | strict ObjectId, no query keys | `{data:{user}}` |
| PATCH `/api/v1/admin/users/:userId/status` | `{status,reason,expectedRevision}`, no query keys | `{data:{user},message}` |

- Current active verified admin session required. No client actor, email, roles, tokenVersion
  or timestamps may be injected. All outcomes, including CORS/body-parser/auth/quota errors,
  use `Cache-Control: no-store`. Existing standardized error envelope applies.
- User DTO: id/name/email/roles/status/instructorStatus/revision. Detail/PATCH additionally
  include createdAt/updatedAt. Password hashes, reset/token/session data, private profiles,
  internal counters, financial balances and raw status reasons are not returned.
- q is trimmed/lowercased, 1–100 characters, literal case-insensitive name/email prefix;
  control/format characters are rejected before trimming. No raw regex or nested query.
- limit is a decimal integer 1–100 (default 20). Sort createdAt/id descending, limit+1;
  no count/skip/offset scan. Read queries have a 5-second server execution limit.
- Cursor is opaque canonical base64url with domain-separated HMAC-SHA256, authenticated
  boundary/version/filter fingerprint, <=1024 chars. Keep q/role/status; limit may change.
  Alteration/filter mismatch is `400 INVALID_CURSOR`. Signing-key rotation invalidates old
  cursors. Lists are a live directory; concurrent changes are not a frozen export snapshot.
- Status is active/suspended, reason plain text 10–500 characters, expectedRevision a real
  safe nonnegative integer. The revision tracks status only, not ordinary profile changes.
- Both GETs share namespace `admin-users-read` and existing PRIVATE_READ_RATE_LIMIT settings;
  PATCH uses `admin-users-write` and ADMIN_WRITE_RATE_LIMIT settings. Quotas are keyed by
  current user across target IDs. Store failure rejects with sanitized 503; 429 has Retry-After.

## Transaction / security decisions

1. Initialize the singleton guard if missing; a harmless revision-zero row can survive a
   later failure. This creates no user status decision or audit outside a transaction.
2. Write the guard in a snapshot/majority transaction. Freshly fence the actor User and
   RefreshSession, checking DB role/active/verification/tokenVersion/family/expiry; JWT roles
   alone do not authorize the command. Driver retries perform database operations only.
3. Load target with hidden status/token revisions. Reject stale expectedRevision with
   `409 STATE_CONFLICT`, even if desired status matches a later decision. No ABA overwrite.
4. Matching-revision same-status returns explicit 200 no-op: no new status/token revision,
   target timestamp, session revocation or audit. Internal guard/fence counters may advance.
5. Reject self-suspension (`SELF_SUSPENSION_NOT_ALLOWED`) and defensively preserve at least
   one active verified admin (`LAST_ACTIVE_ADMIN`). Count inside the serialized transaction;
   no cached role count. Two admins cannot concurrently suspend each other successfully.
6. A real change updates status, status revision, tokenVersion, last actor/time, revokes all
   current refresh sessions, and appends audit atomically. Audit or session write failure
   rolls everything back. Safe counter exhaustion fails closed, never wraps.

Reactivation requires a new login and does not verify email, approve instructors, restore
revoked sessions, edit roles, revoke enrollments or erase orders/progress/owed money.
tokenVersion also rejects a stale in-flight login inserted after the revocation sweep.
Existing auth login/refresh failure codes remain compatible. Status admission is fenced
for this command; previously admitted work in unrelated workflows is not retroactively undone.
Financial truth/reconciliation remains valid for suspended users under the finance policy.

Future role-removal/user-deletion commands must use the same singleton guard and fresh
actor checks. Direct privileged database writes bypass application invariants; this API
does not add a hard-delete path. Existing `seed:admin` now refuses suspended admins, preserves
other roles/status, and rotates an active admin password with token/password versions,
reset-token removal and session revocation in a transaction. This is a privileged bootstrap
operation, not an alternate reactivation endpoint or an authenticated admin command.

## Verification / delivery

Final local result on 2026-11-18: `npm run verify` passed lint, OpenAPI validation and
**484 tests, 0 failed, 0 skipped, 0 cancelled** (156.85 seconds). This adds 22 admin-users
unit/integration regressions over the previous 462-test baseline. Source: `afaf965` plus
the uncommitted S3-03 patch on `feature/sprint-3-mvp-closure`.
Tests cover auth/privacy, safe search/cursors, strict validation, stale roles/tokens/devices,
no-op/revision conflicts, simultaneous cross-suspensions, rollback on session/audit failure,
reactivation/legacy defaults, preserved purchases/earnings, seed safety and quota failures.
Integration tests use only isolated `_test` replica-set fixtures; no external provider write.

Staging B01 and qualified review are not recorded as PASS by these local tests. No GitHub
commit/push, user suspension on the application database, or provider-account change was
performed for this Story. Next Story: **S3-04 course archive/access policy**.
