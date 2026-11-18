# ADR 0006 — Financial integrity, refunds and manual settlements

Date: 2026-11-18. Status: **Accepted**. S3-02 internal foundation is implemented locally;
S3-05/S3-06 now implement guarded refund requests and provider-confirmed finalization/recovery;
payout operator workflows and eligibility remain for their owning Stories. Current evidence:
[refund finalization](sprint_3_refund_finalization.md). Context below preserves the original decision baseline.
Product behavior: [policy register](sprint_3_policy_register.md). Contract draft:
[S3-01 contracts](sprint_3_contracts.md). Source: MVP §9, BR03/04/07/08, financial schema
and the trusted-webhook/manual-transfer flowchart.

## Context

The app has single-course immutable Order/Payment snapshots, a durable Stripe inbox,
transactional purchase fulfillment, one enrollment per student/course and pending sale
EarningEntry rows. It has no Refund/Payout/eligibility implementation. Controllers must
remain HTTP adapters; SDK calls belong to provider adapters, not DB transaction callbacks.

## Decision

### Modules and boundaries

- Keep `config/models/middlewares/services/utils/modules`, Node ESM, Mongoose/Zod and
  node:test/Supertest. No repository-layer rewrite or second payment inbox.
- Domain modules `refunds`, `earnings`, `payouts` coordinate invariants with shared internal
  finance policies; extend current checkout/payments/enrollments only at integration points.
- `stripePayment.service.js` remains the only Stripe SDK boundary; inject provider and clock.
  A refund worker consumes normalized refund evidence through the existing inbox/lease
  machinery, distinct from the current checkout payload parser.
- HTTP DTOs are allowlisted; no secrets, raw provider errors, arbitrary monetary mutation,
  card data or operational lease details. Financial totals are exact integers with EGP.

### Collections / indexes for S3-02

| Model | Minimum responsibilities / indexes |
| --- | --- |
| FinancialPolicyVersion | Immutable version, effectiveFrom, window seconds, approval provenance; unique version |
| Refund | paymentId/orderId/provider, original full amount/currency snapshot, source, local key/fingerprint, provider key/ID, status, lease/retry/reconciliation metadata; see uniqueness below |
| Payout | instructorId/currency/month boundaries/cutoff, immutable reserved total, status/revision, created/sealed/paid actors, transfer attempt/reference and idempotency fingerprint |
| PayoutItem | Immutable payoutId/earningEntryId/signed snapshot; unique(payoutId,earningEntryId); earningEntryId lookup |
| InstructorFinanceState | Unique instructorId; revision + transfer fence. A shared DB write serializes every claim/refund/eligibility/cancel/paid decision across processes |
| FinancialHold | Bounded source metadata per hold; unique(instructorId,sourceType,sourceId), indexed unresolved state; do not grow an embedded hold array forever |
| AdminAuditEvent | Append-only actor/action/target/reason/requestId/allowlisted changes; target/time + actor/time indexes; no raw payloads |

Existing EarningEntry money/type/source remain immutable; extend dependency/eligibility
metadata only. Add policyVersion/paymentConfirmedAt/deadline fields to Order/Payment as
specified in P06. Enrollment gains an explicit revocation reason/source fence. No new
HTTP controller or public route is needed merely to define these models and policies.

For idempotent transition commands, an audited receipt may carry action/key/fingerprint and
the safe original response. Use partial unique(actorId,action,idempotencyKey) for keyed
commands only; keyless audit events must not collide. Creation identities remain on their
Refund/Payout resource. Transition replay semantics are fixed in the contract, not inferred
from the current mutable resource state.

Refund uniqueness: partial unique(provider,providerRefundId) and
(provider,providerIdempotencyKey) only when strings exist; partial unique(initiatedBy,
idempotencyKey) only for local actors with both fields. Include orderId, policy override,
reason and resource identity in the normalized fingerprint. Store a server-owned provider
key independent of the client's header, so two admins' equal headers cannot collide at Stripe.

S3-02 refinement: full-refund exclusivity uses a partial unique(paymentId) index for full
kind and status in requested/processing/pending/requires_reconciliation/succeeded.
The stored `reservationActive` flag originally proposed is **not** implemented: direct
status filtering avoids a redundant flag drifting out of sync. Only authoritative failed/
cancelled resolution releases the full-refund constraint. External partial refunds can
have multiple provider IDs and must not be lost to a full-refund-only unique constraint.
Their unresolved hold prevents an additional local full request. No unique-null trap.

Payout uniqueness: one active instructor/currency claim (draft/pending), directly indexed
by those statuses rather than a second active flag; creator/key replay
scope, and partial unique(transferMethod,normalizedTransferReference) for real references.
PayoutItem earningEntryId is **not** globally unique: cancelled disclosures are historical,
and their released earning can legitimately appear in a later payout. EarningEntry.payoutId
plus the finance-state transaction enforces one active claim. Transfer attempt IDs are also
unique when present. Null provider/command/transfer IDs do not participate in their partial
unique indexes. The index filters were exercised on the isolated test replica set; review
support on the deployment MongoDB version before rollout.
[MongoDB partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/).

### Refund protocol

1. Check fresh admin/session, policy, current successful payment and source ownership.
2. In one transaction, acquire finance guard, reserve the Refund/provider key/fingerprint,
   enforce one active/full-success refund, place a hold and record audit.
3. After commit, call Stripe with the stored immutable request and key. Never send from a
   callback that MongoDB may replay. HTTP 202 means durable acceptance, not money returned.
4. Persist/ingest authenticated provider evidence with fenced leases and bounded retry.
   Event-before-response correlates via server-generated refund metadata and provider ID;
   it must bind the reserved row, not create a second external refund row.
5. Only confirmed full success atomically changes Refund/Order/Payment, releases purchase
   slot, applies the correct ledger effect, revokes the matching enrollment source and
   marks the inbox event processed. A refunded old order cannot revoke a repurchased course.

Admin authority is checked at admission of a new request/transition. A worker recording
trusted financial truth must not discard it because the initiating admin/student/instructor
was later suspended; preserve original actor provenance and use the system-processing audit
identity. In particular, suspension must not turn a provider-accepted refund into a lost event.

Local Refund states: requested → processing → pending or succeeded; ambiguous work →
requires_reconciliation; authoritative failure/cancellation → failed/cancelled. Map provider
`requires_action` to pending/reconciliation, not succeeded. A later retry fetches current
provider truth; it cannot regress an already confirmed success based on an old failure event.
If a provider reports contradictory later financial truth, hold/alert/reconcile explicitly
rather than silently removing the accounting effect.

S3-05 adds guarded createRefund/retrieveRefund to the Stripe provider facade through
`stripeRefund.adapter.js`; the application factory keeps monetary issuance disabled until
S3-06. A bounded provider-history preflight prevents creating over unresolved external
refunds. Request reservation/hold/audit and a single post-commit attempt are locally tested;
none of the final financial/access protocol is claimed complete. Planned recovery capabilities:
createRefund(storedRequest), retrieveRefund(providerId), scanRefunds(paymentIdentity,cursor,
limit), and validate/normalize refund evidence. Validate live mode, amount, currency and
payment/order association. Unknown network outcome is not definitive failure. Older unknown
attempts are reconciled rather than recreated after the provider's idempotency retention.
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

External full success follows the same financial reducer after verified association,
regardless of whether a local policy would have admitted the request. Partial refund,
dispute or unsupported financial truth creates a hold and reconciliation case, not an
ignored event followed by an overpayment. Event configuration/ingress support must include
these safety events before enabling payouts. [Stripe event types](https://docs.stripe.com/api/events/types).

### Refund / payout interlock

| Original due | Full refund effect |
| --- | --- |
| Unreserved pending/eligible | Reverse sale; no additional negative that double-debits |
| Reserved in unsealed draft | Cancel the whole draft, keep its items, release other claims and reverse the refunded sale |
| Sealed pending/transfer unknown | Keep original amount/items frozen; create one pending adjustment dependent on payout resolution and hold further payouts |
| Previous sealed payout resolved paid | Keep its original history; make the negative adjustment eligible debt for next payout |
| Previous sealed payout confirmed not sent/cancelled | Reverse refunded sale and provisional adjustment so there is only one effective debit; release other claims |
| Already paid | Keep historical paid payout unchanged; one negative adjustment of the original instructor snapshot enters the next settlement |

All paths write the same InstructorFinanceState in transactions. A JS mutex or a check-then-
write without a shared conflict document is not sufficient. Pending transfers are never
cancelled by age alone. Restore/recovery must reconcile with both provider and manual
transfer records before issuing new external effects from a restored database.

### Eligibility / payout protocol

Policy version fixes eligibleAt from paymentConfirmedAt. Eligibility needs no unresolved
hold. Month/cutoff uses Africa/Cairo calendar boundaries stored UTC; select all earlier
unsettled eligible positives **and negatives** up to cutoff. Client cannot choose entries
or amount. Exact net <= 0 creates no transfer and does not forgive debt.

draft → pending seals immutable amount/items, responsible operator and transferAttemptId
before any manual transfer. pending → paid requires matching amount/reference and fresh
admin authority. Repeated identical confirmation is idempotent; conflict is 409. draft
may cancel; pending cancellation requires confirmed no-transfer evidence. Unknown outcome
holds the instructor until reconcile; paid is final. No Stripe Connect/Payout API call.

Budget database work before reservation: exceed measured transaction capacity → explicit
error/held operational resolution, never first-N positive selection or a hidden truncated
debt list. This budget is measured before S3-09; not an invented unlimited scale promise.

### Invariants and verification

One sale/order, at most one full refund effect/payment, one adjustment/refund, one active
earning claim, immutable snapshots and paid disclosures, source-fenced enrollment access,
exact safe totals and no TTL on financial/audit history. Use BigInt intermediates or exact
aggregation and check safe JSON limits; never round floating-point financial totals.

S3-02 tests validate models/indexes/money/holds/rollback/concurrent guards without provider
writes. S3-05–10 add duplicate/out-of-order/unknown/24h retry, stale leases, shutdown,
refund-vs-transfer races and repurchase regression. Existing 432 tests must remain green.

## Alternatives / consequences

Rejected: embedded payout arrays without bounds, client-trusted prices, UI-only duplicate
prevention, provider calls inside transactions, editing a paid payout, deleting history,
or treating pending transfer as unpaid. The selected design costs several small collections
and additional reconciliation states, but keeps the financial audit and provider boundary
explicit without introducing advanced accounting or automatic bank transfer features.

Review basis: MongoDB transaction callbacks can retry, so effects outside the DB must be
separately controlled. [MongoDB Node driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).
