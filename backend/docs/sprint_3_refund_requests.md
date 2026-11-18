# S3-05 — Durable full-refund requests and Stripe adapter

Historical S3-05 snapshot. S3-06 now supplies the reducer/events/recovery and replaces
the code-only gate with validated `REFUND_PROCESSING_ENABLED=false` (default).
New Checkout/fulfillment attach policy/confirmation when a reviewed active policy exists.
No policy is automatically activated. Current behavior and evidence:
[S3-06 implementation](sprint_3_refund_finalization.md).

Date: 2026-11-18. Branch: `feature/sprint-3-mvp-closure`. Sources: MVP refund flow,
[financial ADR](adr-0006-financial-integrity-and-settlements.md),
[policy register P01–P09](sprint_3_policy_register.md) and the Sprint 3 contract.
Scope: reservation/idempotency/holds, safe reads, tested provider issuance and bounded
post-commit dispatch. Atomic refund finalization, event ingestion/recovery, ledger/access
effects and hold release belong to S3-06. Repurchase is S3-07; eligibility is S3-08.

## Activation boundary

The default application Stripe provider **does not issue refunds yet**. Its code-level
`refundIssuanceEnabled=false` capability returns `503 REFUND_PROCESSING_NOT_ENABLED`
before a new reservation. It is not an environment switch or a client-controlled field.
Tests explicitly inject an enabled fake provider/SDK. There were no actual Stripe writes.
Only enable the application provider when S3-06 reducer, signed-event support and recovery
are integrated and verified; payment/refund finalization must be atomic with entitlement
and ledger effects. Existing Checkout behavior is unchanged.

Even after provider activation, old purchases lacking frozen policy/sale mapping and
trusted matching paymentConfirmedAt fail closed. Current Checkout/fulfillment have not
yet been upgraded to activate that financial policy. Never patch old paidAt into the
confirmation field or assume the current policy applied to historical purchases.

## Models and indexes

- Refund reuses S3-02 unique actor/key, nullable provider/key and active-or-successful
  full-refund/payment indexes. Adds nullable immutable policyVersionId/window/confirmation/
  deadline/paymentIntentId snapshots. The intent ID stays private.
- Adds private dispatchStartedAt (write-once), providerStatus, providerCreatedAt (write-once),
  providerObservedAt and existing bounded lease/attempt/revision fields. No raw provider
  response, destination/card information, customer data or growing evidence array is stored.
- Adds createdAt/id and status/createdAt/id indexes for bounded reads. No TTL/index drop.
- FinancialHold adds optional immutable paymentId plus payment/resolvedAt lookup. New refund
  holds are payment-scoped, so another order for the same instructor may still be refunded.
  Unmapped legacy holds conservatively require review; payout dependency holds do not
  silently forbid recording a refund obligation.
- Refund/hold/audit writes use the shared InstructorFinanceState transaction guard, across
  processes. A harmless guard identity row may survive a failed transaction; domain state
  and audit do not. No active policy or historical-data backfill runs at startup.

## Validation / routes / controller

`modules/refunds` separates schemas, presenter, admission policy, reservation service,
issuance service, facade, controller and routes. Shared admin identity/device fences are
reused. Signed keyset cursor encoding moved to a shared utility with domain-separated
namespaces; existing admin-user cursor encoding/filter binding remains compatible.

| Operation | Input | Success |
| --- | --- | --- |
| POST `/api/v1/admin/orders/:orderId/refunds` | Idempotency-Key + `{reason,overrideWindow?:boolean}` | 202 `{data:{refund},message}` |
| GET `/api/v1/admin/refunds` | optional status/orderId/cursor/limit | 200 `{data:{refunds,pagination:{hasMore,nextCursor}}}` |
| GET `/api/v1/admin/refunds/:refundId` | strict ID, no query | 200 `{data:{refund}}` |

All require a current active verified admin session. Mutations recheck/fence current DB
role, tokenVersion and device inside the financial transaction. Suspension of a student/
instructor or the initiator after admission does not erase financial obligations or discard
provider truth. Existing purchases/progress/access are not mutated by this Story.

Zod only: ObjectIds; strict unknown-field rejection; reason trimmed 10–500 plain-text chars
with raw control/format rejection; actual boolean override default false; case-sensitive
key 16–128 ASCII letters/digits/dot/underscore/hyphen. No client amount/currency/status/
actor/provider identity. GET limit 1–100/default20, createdAt/id descending, limit+1 with
signed filter-bound cursor, 5-second query limit and no unbounded total count/offset scan.

All outcomes are no-store, including CORS/parser/auth/quota errors. Refund reads share
`admin-refunds-read` using PRIVATE_READ settings. Creation uses `admin-refunds-write` and
ADMIN_WRITE settings, independently of order-read quota. Shared-store failure rejects
before reservation. There is no mutation/retry/cancel/complete API on the Refund resource.

## Admission and stable replay

1. Find the immutable instructor identity as a hint; reload authoritative order/payment/
   policy/sale under the shared financial guard. Fresh admin/device writes fence current
   authorization. No network operation occurs in the transaction.
2. Existing actor/key + same normalized order/reason/override returns the original receipt;
   changed intent returns IDEMPOTENCY_CONFLICT. The actor fence and unique index also cover
   concurrent same-key requests on different instructors/orders.
3. Require Order paid, Payment succeeded/Stripe, equal safe EGP amount and correct binding/
   payment intent, exact original revenue split, matching policy-bound sale and valid policy
   approval/activation preceding the sale. Require matching trusted confirmation times and
   a correctly derived immutable deadline; no current course price or paidAt inference.
4. Standard admission time must be strictly before the deadline. An explicit audited
   override needs that policy's permission and bypasses time only. Duplicate full refunds,
   completed refunds, external partials and unresolved scoped/unmapped holds fail closed.
5. Create the full immutable Refund, payment-scoped hold and keyed audit receipt atomically.
   A failed audit/hold write aborts everything before any provider call.

The returned accepted DTO is always the original `{id,orderId,amountMinor,currency,
status:"requested",createdAt}`; the message is stable. Replays never call Stripe again,
even after expiry/config outage/provider result changes. GET reports current persisted
status plus updatedAt/completedAt and allowlisted failureCode. It never exposes provider
IDs, keys, actor/reason, fingerprint, lease or raw evidence.

## Provider attempt and unknown outcomes

After commit, an enabled provider may make one attempt. A second transaction claims only
requested, never-dispatched, policy-bound rows with the required unresolved hold. It
sets dispatchStartedAt/lease/attempt before leaving the DB. A persisted random server key
(`refund_UUID`) is independent of the client's header. Replays and expired/uncertain attempts
never send a new POST, including after Stripe's key retention window.
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

The adapter verifies a Test-mode succeeded PaymentIntent and its order/amount/currency,
captured/paid/non-disputed full charge, and a complete bounded scan of previous refunds.
An active/successful/partial/unknown refund or incomplete/repeated scan blocks new issuance.
It sends full immutable amount + payment_intent and server correlation IDs only, with no
PII/free-text reason/client key. SDK retries are disabled for this path; timeouts are bounded.
[Create refund](https://docs.stripe.com/api/refunds/create).

Normalized results must match amount/currency/payment/order/refund metadata; no raw response
is persisted. Test mode is corroborated by the parent intent and Test key rather than
assuming the Refund object has its own mode flag. Provider pending/requires_action/
succeeded/failed/canceled evidence is private; all awaits S3-06 finalization as local pending.
No completion timestamp, ledger reversal, access revocation or hold release occurs here.
[Refund object](https://docs.stripe.com/api/refunds/object).

Unknown/network/invalid responses become requires_reconciliation with a safe code and
retained hold. A post-provider DB failure still returns the durable 202 and leaves the
dispatch fence/hold for recovery. A stale lease cannot bind/overwrite a newer worker result.
Shutdown/operation deadlines detach SDK waits, prevent late DB writes and reject new
admission. Cancellation is checked after each provider preflight read and before POST,
so a late preflight result cannot start a new refund after shutdown. An already submitted
POST can still settle remotely; never label cancellation as definitive provider failure.

No background resend worker is started in S3-05. Crash-before-dispatch, expired processing,
unknown outcomes and provider evidence remain durably discoverable for S3-06 recovery.
The default issuance gate prevents deploying these unfinished end-to-end monetary effects.

## Verification / handoff

Final `npm run verify` on 2026-11-18 passed lint, OpenAPI validation and **542 tests**,
with **0 failures, 0 skips, 0 cancellations** in **145.01 seconds**. S3-05 adds 33 tests
over the S3-04 509-test baseline. Source: `e6f9f5b` plus uncommitted S3-04/S3-05 changes.
Targeted security/finance/refund run: **66/66 PASS** (8.75 seconds) before the last three
integration cases were added. Final suite includes concurrency/key scopes, rollback,
safe DTO/cursors, legacy/window checks, external partials/holds, provider history, disabled
default issuance, mismatch, no-late-POST cancellation, quota failure and bounded shutdown.
Only isolated `_test` replica-set fixtures/fake providers are used.

Local OpenAPI **1.3.0** and frontend handoff describe the implemented boundary and activation
gate. No new `.env` value, provider account action, Git commit/push or Staging acceptance
is performed. S3-04 changes remain local alongside this Story; base commit is `e6f9f5b`.
Next: **S3-06 refund events, atomic financial/access finalization and recovery**.
