# Sprint 3 — S3-01 contract and schema handoff

Date: 2026-11-18. Status: **S3-02 foundation and S3-03 admin users implemented locally;
later Story contracts remain design only**.
Precedence for selected product behavior: [policy register](sprint_3_policy_register.md).
Architecture: [financial ADR](adr-0006-financial-integrity-and-settlements.md) and
[content ADR](adr-0007-published-course-revisions.md). Public implemented operations are
defined by the served OpenAPI, now including S3-03. This file is not a substitute for it.

## 1. S3-02 internal foundation boundary

S3-02 is implemented locally as an internal foundation, not a refund/payout HTTP release.
The implementation, indexes, service interfaces and verification are recorded in
[S3-02 evidence](sprint_3_financial_foundation.md). The following table defines its scope;
S3-03 is implemented as noted below; S3-04 onward remain unimplemented design contracts.

| Layer | Foundation work | Must not do |
| --- | --- | --- |
| Mongoose | FinancialPolicyVersion, Refund, Payout, PayoutItem, InstructorFinanceState, FinancialHold, AdminAuditEvent; additive guarded metadata on Order/Payment/EarningEntry/Enrollment | Rewrite amounts, drop existing indexes, seed active production policy without deployment review |
| Zod | Reusable exact EGP/safe integer/ObjectId/policy version/key/reason/date-window validation in owning modules; server-only normalized provider evidence | Trust client money, use Joi/Yup or invent HTTP endpoint schemas for unimplemented handlers |
| Services/utils | Money aggregation, immutable fingerprint, financial transition/claim guards, clock injection and audit with transaction session | Call a provider in a retryable transaction or create background money effects at import/startup |
| Controller/routes | None required by this foundation story | Add a Swagger operation just because its schema exists |
| Tests | Model sign/index/uniqueness/immutability, transaction rollback and concurrent claims; no internet dependency | Use development DB or treat a mocked refund as a real provider proof |

No new environment value or runtime policy row is installed by S3-01/S3-02. The 14-day selection
is explicit design input; activation later is versioned and deployed, not a hidden default.

## 2. Shared planned HTTP conventions

- `/api/v1`, success `{data,message?}`, error `{error:{code,message,details:[]}}`.
- Existing auth and current active role/session checks, noStore for private/financial reads
  and mutations, bounded rate limits. Do not trust JWT role alone for a dangerous transition.
- Zod strict object schemas; reject unknown fields and control/format characters in reasons.
  IDs are 24-hex ObjectIds. Reasons are trimmed plain text, 10–500 characters. No arbitrary
  URLs, raw provider payloads, client actor IDs or timestamps in mutation bodies.
- `Idempotency-Key`: 16–128 ASCII letters/digits/hyphen/underscore/dot, case-sensitive; callers
  generate sufficient entropy. Fingerprint normalizes the validated body/resource/action.
  Same actor/action/key + different fingerprint returns 409 `IDEMPOTENCY_CONFLICT`.
- The scope includes the action, not merely the actor: creation and mark-paid must not share
  an accidental uniqueness bucket. Creation key is stored on Refund/Payout; transition replay
  can use an immutable audited command receipt with a partial unique(actorId,action,key).
  Its result is a safe DTO snapshot, not provider secrets. Successful repeated requests return
  that original accepted result before rejecting an old expectedRevision.
- `expectedRevision`: integer 0..MAX_SAFE_INTEGER, required for admin/resource state mutations.
  Compare-and-swap conflicts return 409 `STATE_CONFLICT`; the client reloads instead of retrying
  arbitrary conflicting changes. A create request has no resource revision yet.
- Date filters: UTC ISO timestamps, half-open `[from,to)`, `from<to`, max query range 366 days;
  historical detail remains accessible by ID. Lists use limit 1–100, default 20, stable
  createdAt+id cursor bound to the filter set; reject malformed/stale-filter cursors as 400.
  Existing Sprint 1/2 page/limit endpoints remain backward-compatible, not silently converted.
- 400 `VALIDATION_ERROR`, 401 `AUTHENTICATION_REQUIRED`, 403 `INSUFFICIENT_PERMISSIONS`,
  404 for missing/non-owned resources, 409 domain conflicts, 413 oversized body, 429 Retry-After,
  safe 503 operational unavailability and 500 generic failure. Do not change validation to 422.

## 3. First product contracts to implement after foundation

### S3-03 admin users

Implemented locally; [behavior and verification](sprint_3_admin_users.md). Directory
pagination uses signed createdAt/id cursors bound to normalized filters. Status changes
use the status-specific revision; same-state no-op requires the current revision, stale
revision always conflicts. No Idempotency-Key is introduced for this operation.

- `GET /admin/users`: optional q (1–100 safe chars; email/name prefix, escaped not raw regex),
  role (student/instructor/admin), status (active/suspended), cursor/limit. Response
  `{data:{users:[{id,name,email,roles,status,instructorStatus,revision}],pagination:{nextCursor,hasMore}}}`.
- `GET /admin/users/:userId`: same safe user fields + timestamps, no password/token fields.
- `PATCH /admin/users/:userId/status`: `{status,reason,expectedRevision}`. Response
  `{data:{user},message}` after commit; identical no-op is explicit and cannot invalidate
  unrelated sessions twice. No body roles/email/tokenVersion.
- `409 LAST_ACTIVE_ADMIN`/`SELF_SUSPENSION_NOT_ALLOWED` are protected transitions. Existing
  suspension Auth errors remain compatible. Audit/session invalidation commit with state.

### S3-04 archive / legal-security access policy

- `POST /admin/courses/:courseId/archive`: `{reason,expectedRevision}` → 200 `{data:{course}}`.
- `PATCH /admin/courses/:courseId/access-policy`: `{accessStatus:"available"|"blocked",reason,
  expectedRevision}` → 200 safe course DTO. Raw legal reason is admin-only; learners get a
  non-sensitive availability code. Unblock never unarchives or resurrects unavailable media.
- Existing library/playback/PDF/progress/catalog/Checkout routes share the access table from
  the plan. No new unarchive/delete capability is implied by these routes.

### S3-05 full refund request

- `POST /admin/orders/:orderId/refunds`, key header required, strict body
  `{reason,overrideWindow?:boolean}` (default false). No client amount/payment/provider ID.
- Fresh success → 202 `{data:{refund:{id,orderId,amountMinor,currency,status,createdAt}},message}`.
  Replay returns the same accepted receipt, even if the worker finished since then; GET shows
  current state. 202 and redirect never revoke enrollment by themselves.
- `GET /admin/refunds` and `/admin/refunds/:refundId` return current state/safe timestamps/
  sanitized failure code and pagination. Provider secret/lease/raw request are never DTO fields.
- Planned domain errors: `REFUND_WINDOW_EXPIRED`, `REFUND_NOT_ALLOWED`,
  `REFUND_IN_PROGRESS`, `REFUND_ALREADY_COMPLETED`, `FINANCIAL_RECONCILIATION_REQUIRED`.
  Use status 409 for invalid state; role failures stay 403. Unknown provider outcome after
  durable acceptance is shown as pending/reconciliation, not a false "refund failed" 503.

For refund events, retain the existing signed raw-body `/webhooks/stripe` route and durable
inbox. Extend its discriminator/worker deliberately; do not pass Refund objects to the current
checkout parser. Provider `succeeded` is distinct from creation/pending/requires_action.
[Stripe Refund object](https://docs.stripe.com/api/refunds/object).

## 4. Downstream contracts / freeze gates

The plan's route inventory remains the downstream target for S3-06–17. Before each owning
Story starts, freeze its complete request/DTO/error/state examples using the ADR invariants:

- S3-07: enrollment revocationReason + sourceOrder fencing, repurchase preserves progress;
  current order paidAt remains compatible, add trusted paymentConfirmedAt explicitly.
- S3-08–10: preview is not a reservation. Create payout from instructorId/month/cutoff/key,
  no amount/items. Submit/seal, mark-paid and cancellation use expectedRevision and scoped key;
  mark-paid adds normalized method/reference/confirmedAmountMinor. Unknown transfer resolution
  requires audited evidence, not a freely editable payout status.
- S3-11/12: define grossSales/netSales/refunds/commissionNet/earnedNet/pending/eligible/
  reserved/paid/debt/holds, with EGP/range/asOf, no join duplication or overflow.
- S3-13/14: use the plan's candidate routes, with admin corrections route replacing the
  tentative instructor direct-corrections path. All candidate mutations require the course/
  revision/section/lesson association and expectedRevision. No live ID cross-write loophole.

This freeze process is incremental, not a claim that unimplemented downstream operations
are ready for frontend calls. FE3 reviews the draft contract; the maintained public contract
is [OpenAPI](openapi.yaml), containing only implemented operations.
