# S3-02 — Financial foundation implementation

Date: 2026-11-18. Scope: internal models, validation, domain policies, guarded transactions
and read-only diagnostics. No refund/payout HTTP endpoint, provider call or money-moving
worker is introduced. [S3-01 policy](sprint_3_policy_register.md) remains the product contract.

## 1. Model / index inventory

| Model | Implemented protection / indexes |
| --- | --- |
| FinancialPolicyVersion | Explicit immutable approval/effectiveFrom/window; unique version and activation instant; append-only, no auto seed |
| Refund | Immutable amount/payment/source/request identity; nullable provider/command indexes ignore absent values; full active-or-successful status uniqueness per payment; bounded retry/lease fields |
| Payout | Immutable total/lines-count/month/cutoff/creator identity; one draft/pending claim per instructor/currency; unique command, attempt and normalized actual transfer reference |
| PayoutItem | Immutable signed entry snapshot; unique(payoutId,earningEntryId), separate earning lookup; no global constraint that breaks reclaims after cancellation |
| InstructorFinanceState | One guard per existing user identity; revision CAS with safe-integer overflow guard and optional active-payout reference; never a growing embedded ledger |
| FinancialHold | Unique instructor/sourceType/sourceId; unresolved lookup index; source/code immutable and resolution write-once |
| AdminAuditEvent | Append-only allowlisted action/target/actor/state changes; minimal private command receipt; action-scoped key uniqueness and target/actor-time indexes |

S3-02 refines ADR 0006: partial indexes filter actual Refund/Payout statuses, not a stored
reservationActive flag. This eliminates flag/state inconsistency while preserving the same
exclusivity rule. Financial records/audit have no TTL; arrays of payouts/holds are not embedded.

New financial models reject ordinary Mongoose hard deletion, append-only mutation,
snapshot changes, replacements, pipelines, and update/delete bulkWrite bypasses. Financial
batches are validated inserts only. Native MongoDB collection access/privileged credentials
can bypass application middleware; restrict database credentials and audit operational repairs.
This is not a database-level tamper-proof ledger or a substitute for domain/provider checks.

Additive legacy fields:

- Order: nullable policyVersionId + refundWindowSeconds snapshot; paymentConfirmedAt and
  refundDeadlineAt assigned once through null-CAS.
- Payment: paymentConfirmedAt assigned once; existing paidAt semantics preserved.
- EarningEntry: nullable policyVersionId, dependentOnPayoutId and write-once eligibleAt;
  pending/eligibility/dependency indexes added. Only refund adjustments can depend on a payout.
- Enrollment: revocationReason/revocationSourceOrderId nullable; no access rule/reactivation
  is enabled yet. Existing enrollment/progress presentation contracts stay unchanged.

No historic field is backfilled at startup. Optional fields remain null for legacy records.
Normal writes through the old fulfillment service do not invent policy approval or provider
confirmation; integrating that evidence is still G03/S3-06/S3-08 work.

## 2. Zod / controllers / routes

`modules/finance/finance.schemas.js` supplies strict ObjectId, safe EGP amount, key, reason,
policy provenance, UTC deadline/range, hold and transfer-reference validation.
`modules/audit/audit.schemas.js` accepts only typed audit metadata/receipts, never arbitrary
before/after user documents or raw provider payloads. Mongoose validation is extra storage
defense; external/domain inputs use Zod exclusively.

No new controller/route is needed for this internal story. Existing success/error envelopes,
auth middleware, public OpenAPI and frontend endpoint availability are unchanged. State
transition policies are structural checks, **not** proof that Stripe accepted a refund or
an operator transferred money. Future HTTP services must supply current actor authority,
references, trusted provider evidence and whole-transition validation.

## 3. Services and utilities

- `createFinanceFoundationService().runForInstructor` initializes a harmless revision-zero
  guard if absent, then writes it inside a replica-set transaction to serialize decisions
  across processes. Callbacks may retry: database work only, no SDK/email/bank/network effect.
- This is not an authorization API. It checks user existence but deliberately does not
  discard accounting because that user was suspended/deapproved. Future initiating routes
  must authorize the actor; provider reconciliation must still record financial facts.
- `openHold/resolveHold/assertNoHolds` require the active scoped transaction context. Hold
  creation/resolution and its minimal audit commit together. Duplicate active holds/repeated
  matching resolutions do not duplicate audit. Resolved sources are not silently reopened;
  a new incident needs its own explicit source identity and audited policy.
- Guard identity provisioning can survive a failed transaction, but revision/domain claims/
  holds/items/audit roll back. Unknown IDs cannot create a financial guard.
- `sumMinorUnits` uses BigInt intermediates including negative carry; overflow throws rather
  than rounding. `financialDeadlines` consumes explicit provider-confirmation input/window,
  not current env or processing paidAt. It does not authenticate that input itself.
- `refundRequestIdentity` normalizes validated intent and hashes stable fields. Generate a
  new provider UUID key only for a new local reservation; retries load the persisted key.
- `inspectFinancialFoundation({afterId?,limit?})` is a bounded, repeatable, snapshot read-only
  report over paid/refunded Orders and policy references. It detects missing mapping/time,
  deadline/split/currency inconsistencies without provider calls, writes, holds or activation.
  A clean report is not provider-proof or permission to issue a payout. No public CLI/route
  is added; legacy repair/deployment tooling belongs to later operations Stories.

## 4. Deployment / compatibility

New models and additive indexes are initialized by the existing startup preparation path.
No active policy row, eligibility job or new provider credential/config is installed.
Before deployment: backup, confirm replica-set/index-filter support, inspect existing data
and plan index builds under load. Never use syncIndexes/drop financial history to make an
index pass. Unique-index failure must stop startup, not silently remove the constraint.

For old records, the read-only report informs an explicit later mapping/reconciliation;
it cannot manufacture the original provider time or retroactively assign the newest policy.
The existing 20/80 revenue split and all old response DTOs remain unchanged.

## 5. Verification and next step

Targeted tests exercise safe values, immutability/bulk guards, null-safe indexes, concurrent
full refund/payout claims, independent service instances, rollback/audit failure, hold
isolation/replay, clock/revision limits and legacy read-only inspection. On 2026-11-18,
`npm run verify` passed lint, OpenAPI validation and **462 tests** with **0 failures,
0 skips, 0 cancellations** in 326.50 seconds. Final targeted financial tests: **30/30 PASS**
in 6.38 seconds. Source: baseline `64f742a7b319f4d1f3be8f5ff9837ee6c9ab4687` plus the
uncommitted local S3-01/S3-02 changes on `feature/sprint-3-mvp-closure`.
Tests use `_test` replica-set data
and fake providers; privileged collection deletion is limited to explicit isolated fixtures.

Next: S3-03 admin users/status. Refund provider processing, real policy activation,
eligibility, payouts, repurchase, Staging and commercial approval are **not completed** by
this foundation. No Git commit/push or provider-account action is performed for this Story.
