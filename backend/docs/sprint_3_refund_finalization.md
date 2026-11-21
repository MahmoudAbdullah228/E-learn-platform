# S3-06 — Provider-confirmed refunds, ledger finalization and recovery

Date: 2026-11-18. Branch: `feature/sprint-3-mvp-closure`.
Baseline: `bedffc976732e7cbb892c3e74b78779b50319635` (S3-04/S3-05).
Scope follows [the execution plan](sprint_3_backend_plan.md),
[P01–P09](sprint_3_policy_register.md) and [the financial ADR](adr-0006-financial-integrity-and-settlements.md).

## Contracts and activation

OpenAPI **1.4.0**, still **61 paths**. This Story extends the existing raw-body
`POST /api/v1/webhooks/stripe`; it adds no frontend webhook, force-complete, retry,
cancel or payout endpoint. Admin creation/read routes from S3-05 remain unchanged.
HTTP 202 is the immutable original accepted receipt. Poll GET for current state.

`REFUND_PROCESSING_ENABLED=false` is the default in validated configuration and the
example environment. No real `.env`, policy activation, provider write or GitHub mutation
is performed by this implementation. An explicit operator activation requires complete
Stripe Test settings and an approved immutable FinancialPolicyVersion effective before
Checkout. When enabled, Checkout refuses new reservations if no policy is active.
Activation/legacy mapping must use a separately reviewed deployment operation with approval
evidence; this Story never seeds, guesses, edits or retroactively assigns a policy.
Real account acceptance and qualified financial review remain required before activation.

Financial webhook accounting and read-only recovery remain active when issuance is off:
disabling new commands must not discard external financial truth. Existing unversioned
orders can be accounted after a genuine external full refund, while admin admission still
refuses missing policy/confirmation evidence. No `paidAt` backfill runs.

## Architecture, storage and validation

- `refundEvent.schemas.js`: Zod projections for signed Refund/Charge/Dispute snapshots,
  strict authenticated current evidence and minimal optional local correlation metadata.
  Raw provider receipts, customer/card fields and arbitrary metadata are not persisted.
- `stripeRefundEvidence.adapter.js`: Test-key/current Test PaymentIntent validation,
  immutable payment association, bounded complete refund scan (at most five pages/500
  rows), zero SDK network retries, sanitized errors and cancellation checks between reads.
- `refundInbox.service.js`: the existing unique Stripe WebhookEvent inbox, with immutable
  origin/payment association and a private processing revision. Known-account receipt and
  FINANCIAL_EVENT_PENDING hold are atomic under the instructor financial guard. Unknown
  association is retained; payment fulfillment binds pending/failed early evidence under
  that guard. Orphan accounts keep their receipt without creating a financial account.
- `refundFulfillment.service.js`: current-evidence reduction inside the same instructor
  guard as financial commands. Lease possession is checked before effects and at commit.
  One transaction commits Refund, Order, Payment, ledger, source-fenced enrollment,
  resolved owned holds, audit and processed inbox state. Any failed proof rolls it all back.
- `refundLedger.service.js`: reversals, draft cancellation and transfer-dependent debt;
  immutable financial snapshots/items are retained.
- `refundRecoveryWorker.service.js`: separate bounded recovery lease/attempts, current
  observations appended to the same inbox, no second payment queue and no provider calls
  inside retryable transactions. Server startup/shutdown owns both workers.
- Indexes: financial inbox paymentIntentId/status; Refund status/nextRecoveryAt/
  recoveryLeaseUntil. Existing provider/command/full-refund unique indexes remain intact.
  Financial history has no TTL deletion. Private IDs/leases/counters are excluded from DTOs.

An issuance SDK response alone still cannot change access or the ledger. A current
authenticated read plus immutable signed/reconciliation association is required. A webhook
that wins before the issuance response binds the original reserved row; the stale issuance
lease/status cannot overwrite its terminal outcome. Duplicate/out-of-order receipts do not
regress success. Contradictory later truth retains a distinct operational review hold.

## Outcomes and ledger interlock

| Current evidence / sale state | Atomic result |
| --- | --- |
| Full succeeded; sale pending/eligible and unreserved | Reverse original sale; full Order/Payment refund, release slot and revoke matching active enrollment |
| Full succeeded; sale included in draft payout | Cancel the entire draft with system/refund provenance and confirmed non-transfer; release every claim; reverse refunded sale; retain all PayoutItems/audit |
| Full succeeded; sealed pending transfer | Keep immutable payout and included sale; one negative pending adjustment dependent on that payout, plus REFUND_DEPENDENT_TRANSFER hold |
| Full succeeded; confirmed paid transfer | Keep paid payout/history; one eligible negative adjustment, carried into future settlement |
| Pending/requires_action | Preserve access/sale; keep refund hold and schedule observation |
| Authenticated failed/canceled | Mark failed/cancelled, preserve access/sale and resolve the owned refund hold; unrelated holds remain |
| External partial | Requires reconciliation and hold; no claim of a full refund or automatic access revocation |
| Dispute, including closed/funds reinstated | Review hold; no automatic adjudication, full-refund claim or hold release |
| Unknown outcome / mismatched proof / incomplete scan | Preserve financial state and holds; safe retry/review code, never fabricated failure |

Charge notifications retrieve the complete bounded current refund list, queue each minimal
observation in the same inbox and retain a charge hold until accounting. Contradictory
aggregate totals retain a separate review hold even after one full refund is accounted.
Every transfer decision in later S3-09/S3-10 must acquire the same instructor guard and
respect unresolved holds; their operator endpoints are deliberately not implemented here.
Deferred negative adjustments are not made available until S3-10 resolves the transfer.

Enrollment revocation matches student, course **and sourceOrderId**, and requires active
status. Existing admin/legal/security revocations and a newer purchase source are preserved.
Progress remains stored. New credentials are denied by the existing enrollment guard;
previous signed video/PDF credentials may remain valid until their existing TTL expires.
Repurchase/reactivation and retained-progress recalculation remain **S3-07**.

## Policy and trusted confirmation

New Checkout freezes the newest approved effective policy ID and refund-window snapshot.
Later policy versions cannot change it. Fulfillment uses the authenticated successful
Checkout event's `created` timestamp, corroborated by the current paid Checkout/PaymentIntent,
as a seconds-to-UTC confirmation fact; it rejects future/pre-purchase timestamps. It sets
Order/Payment confirmation and Order deadline once, and records the sale's policy/eligibleAt.
An unpaid completed event never starts the refund clock. A delayed or duplicate success
never moves the original confirmation or deadline. Legacy processed events are not silently
replayed into a new policy. Sales remain pending: eligibility admission is **S3-08**.

## Stripe destination and operations

Keep platform-account, Test Mode, **snapshot** payloads. Subscribe to these 13 types:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
refund.created
refund.updated
refund.failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
```

Use the configured public `/api/v1/webhooks/stripe` destination; preserve exact uncompressed
JSON bytes for signature validation (1 MiB maximum). HTTP 200 acknowledges durable receipt,
not fulfillment. Unknown valid types remain ignored. Refund has no own livemode field:
the trusted Test event envelope and current Test parent PaymentIntent supply mode evidence.
Provider semantics: [event types](https://docs.stripe.com/api/events/types),
[Refund object](https://docs.stripe.com/api/refunds/object),
[Charge object](https://docs.stripe.com/api/charges/object),
[Dispute object](https://docs.stripe.com/api/disputes/object).

Recovery polls at most one row per five seconds, outside transactions, with bounded
operation time, per-row backoff and eight automatic observations. Requested, never-dispatched
commands may receive their **first** issuance only when enabled. Once dispatchStartedAt is
set, recovery only retrieves/scans: it **never POSTs again**, including after 24 hours.
A complete empty scan is still an unknown outcome; the hold stays. Bound external refunds
are observed with issuance disabled. Exhausted/contradictory outcomes need operator review.
Shutdown cancels further awaits, bounds draining, ignores late reads and leaves leases
for recovery; it cannot retract a request Stripe already accepted.

Commands (run from `backend`; substitute actual persisted IDs):

```powershell
# Dry-run: validates input, no database/provider call.
npm run refunds:reconcile -- --refund-id <refund-id>
# One read-only provider observation; never issuance. May explicitly observe an exhausted row.
npm run refunds:reconcile -- --refund-id <refund-id> --execute
# Recover a retained event through authenticated Stripe retrieval.
npm run payments:events -- --event-id <stripe-event-id> --execute
# Explicit replay of a failed inbox job after its operational cause has been resolved.
npm run payments:events -- --event-id <event-id> --replay --execute
```

Existing ignored financial events from old deployments remain immutable. Authenticated
event recovery appends a deterministic reconciliation receipt instead of rewriting history.
The background inbox worker performs actual accounting after CLI observation; a successful
CLI result is not a refund-success claim. Do not change a command key, delete evidence,
force failed/completed status, clear holds or issue a second provider refund to escape uncertainty.

## Verification and release boundary

`npm run verify` passed: ESLint, OpenAPI validation, **577 tests PASS**, zero failures,
skips or cancellations; test-runner duration **154.41 seconds**. This is 35 new tests over
the 542-test baseline. Tests use only the explicitly isolated MONGO_TEST_URI replica-set
database, never development data. The source is the baseline commit above plus the local
uncommitted S3-06 changes; this is not evidence for an unidentified deployed revision.

Coverage includes current/late/duplicate events, concurrent inbox claims, success-before-
issuance-response, unknown outcome after 24 hours without a second POST, crash-before-
dispatch and admission gating, cross-worker recovery leases, failed/canceled/partial/dispute
outcomes, charge aggregation, immutable draft/pending/paid payout handling, legal/new-source
enrollment protection, full transaction rollback at lease expiry, orphan/early receipts,
legacy ignored-event recovery, bounded scan completeness, late reads after both worker
shutdowns, trusted event time/frozen policy, strict environment settings and safe CLI dry-run.
Staging refund/recovery/repurchase/settlement cases and independent qualified review remain
**NOT RUN** here; no provider funds were moved and no acceptance status was fabricated.
Next Story: **S3-07 — access after refund and safe repurchase**.
