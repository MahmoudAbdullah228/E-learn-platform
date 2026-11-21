# S3-08 — Dated earnings eligibility, holds and signed carry-forward

Date: 2026-11-18. Branch: `feature/sprint-3-mvp-closure`.
Source baseline: `e1314ff8e97aecf12b74292f1697bd3f37c5da39` plus the preserved local
[S3-07 implementation](sprint_3_repurchase.md), whose verified baseline is 595 tests.
Sources: [plan §7.3/S3-08](sprint_3_backend_plan.md),
[P02/P05/P06/P08/P09](sprint_3_policy_register.md),
[financial ADR](adr-0006-financial-integrity-and-settlements.md).

## Scope and architecture

This is an internal job/preview Story. No new HTTP model DTO, controller, route, limiter or
frontend operation is added. Served OpenAPI remains **1.5.0**, **61 paths**, including the
local S3-07 additions. Existing controllers/Zod request contracts are unchanged.
Eligibility means ledger readiness; it does not reserve a payout or transfer money.
Payout preview/admission/operator APIs remain **S3-09/S3-10**.

- `modules/earnings/eligibility.policy.js`: persisted sale/payment/policy proof and exact
  elapsed UTC deadline evaluation. Uses shared exact money and financial policy schemas.
- `eligibility.service.js`: guarded instructor transaction, owned lease, frozen proof,
  holds/refunds/inbox/deferred-debt checks, safe dated backfill and audited promotion.
- `eligibilityEvidence.service.js`: unresolved signed/reconciliation financial inbox facts;
  failed jobs still block. Unassociated null-intent financial facts conservatively block
  new eligibility across instructors until association/classification is reviewed.
- `eligibilityBalance.service.js`: internal snapshot preview of the complete signed
  unreserved balance, history/dependency checks, exact totals and explicit capacity failure.
- `earningsEligibilityWorker.service.js`: bounded leased polling, per-row scheduling,
  recovery after restart and bounded shutdown; no provider dependency or calls.
- `earnings.schemas.js` / `eligibilityOperations.service.js`: strict Zod internal commands,
  UUID lease identity, summary input and bounded operational settings; no client money,
  override/refund policy assignment or force-eligible option.

EarningEntry gains private lease ID/until, next-check/checked timestamps, safe check code
and safe-integer attempt count. Monetary/source/policy snapshots stay immutable; eligibleAt
remains write-once through explicit null compare-and-swap. New candidate index:
`{status,type,eligibleAt,_id}`. WebhookEvent gains `{status,eventType,paymentIntentId}` for
unresolved financial evidence. No TTL/history deletion, new collection, index drop, provider
write, policy activation or legacy mapping occurs. Startup initializes these additive
indexes, starts the worker after readiness and stops it before disconnecting MongoDB.

## Eligibility rules

1. Claim only an unreserved pending **sale** with no transfer dependency. The original
   stored date must be due, or null for proof-based dated backfill. A lease lasts 120 sec;
   only its current owner may commit. Old/missing private metadata is additive-compatible.
2. Re-read the source under the same instructor finance guard used by refunds. Validate
   paid/active-slot Order, succeeded Stripe Payment/PI association, matching EGP amounts,
   original exact revenue split, sale/source/instructor identities and immutable policy.
   The policy must have complete approval provenance and be effective before Checkout.
3. Require matching trusted paymentConfirmedAt on Order/Payment. paidAt is never a fallback.
   Derive deadline from that confirmation and the frozen refundWindowSeconds. Existing
   Order deadline and a non-null sale eligibleAt must match exactly. A newer current policy,
   instructor suspension, processing delay, local timezone or month boundary cannot move it.
4. Promote only at `now >= deadline`, without unresolved instructor financial holds,
   matching/unassociated financial inbox work, unresolved refunds or pending negative
   transfer-dependent adjustments. No privilege/late-window flag bypass exists here.
5. Atomically commit sale pending→eligible, private completion metadata and one system
   `earning.eligible` audit. Final update checks the owned lease against a fresh clock.
   A stale/stolen lease or abort rolls back status/date, review hold and audit together.

The worker does not fetch provider history, touch access/progress, claim payout items,
change a historical split, promote a refund adjustment or resolve an operational hold.
Suspended/deapproved existing instructors retain accounting obligations; missing users
remain pending with EARNINGS_ACCOUNT_REQUIRES_REVIEW and no new financial identity.

### Dated backfill and legacy review

Only a missing eligibleAt with **already matching frozen policy, trusted confirmation and
Order deadline** can be assigned its original derived date. A future deadline is recorded
but does not promote the sale; a mismatched existing date is retained for review.
Missing policy/confirmation or contradictory identity/split puts an owned, audited review
hold on the account and defers the sale. The job never infers a policy from current settings,
maps an old purchase to the latest version, rewrites paidAt, or clears review holds itself.
Reviewed historical mapping/reconciliation is a separate deployment operation. A resolved
hold with still-invalid evidence creates one fresh incident rather than reopening history;
repeated checks reuse its active incident. Unrelated holds remain intact.

Normal hold/inbox/refund/dependency deferral retries after five minutes; proof review after
24 hours. Generic evaluation errors use safe codes and exponential backoff capped at one
hour. An explicit selected-entry CLI check may bypass this retry delay, **never** the
deadline, live lease, source proof or financial hold. Deferred rows do not starve later
healthy candidates. Shutdown leaves an interrupted lease for recovery and checks the abort
signal before further financial effects; DB reads/updates in this module have bounded queries.

## Signed carry-forward preview

`createEligibilityBalanceService().inspect({instructorId,currency?,cutoffAt?})` is internal
and read-only. Currency is EGP; cutoff cannot be in the future. It returns asOf/cutoff,
eligibleSaleMinor, eligibleAdjustmentMinor, netEligibleMinor, deferredAdjustmentMinor,
entryCount, blocked and safe reasonCodes. No actor/provider secret is included.

The preview reads the **complete** unreserved eligible set and pending negative dependency
set, capped at 1000 combined rows. It never takes the first positive rows, filters debt
by periodStart, deletes a zero/negative balance or mutates paid payout history. Positive
earnings respect the selected cutoff; **all already-known eligible debt remains included,
even if newer than that historical positive cutoff**. This prevents choosing a cutoff
that hides a known liability. Pending transfer debt is shown separately and blocks release;
time does not promote or forgive it. S3-10 owns transfer resolution.

Positive proof and negative refund/original paid-sale/payout/dependency proof are checked.
Bad legacy eligible records are returned as blocked review, never trusted as release proof.
Unresolved holds/refunds/inbox facts or active payouts block release. Exact integer helpers
reject unsafe totals. Exceeding the complete-set bound returns EARNINGS_CAPACITY_EXCEEDED;
there is no truncated monetary total. A reviewed batch strategy is needed at that scale.

`blocked=false` is still **not** payout authorization: a zero/negative net produces no
transfer, and S3-09 must revalidate/recompute and atomically reserve under its finance guard.
Never trust a previously read preview as a reservation.

## Configuration and operations

| Variable | Default | Valid range |
| --- | --- | --- |
| EARNINGS_ELIGIBILITY_INTERVAL_MS | 30000 | integer 1000–3600000 |
| EARNINGS_ELIGIBILITY_BATCH_SIZE | 25 | integer 1–100 |
| SHUTDOWN_TIMEOUT_MS | existing 10000 | existing startup validation applies |

The server runs bounded batches automatically. No new refund-window environment setting
is introduced. REFUND_PROCESSING_ENABLED stays false by default; eligibility does not
enable monetary issuance. Only `.env.example` gains operational defaults; real `.env` is unchanged.

```powershell
# Validate only: no DB connection, provider call or state change.
npm run earnings:eligibility
npm run earnings:eligibility -- --entry-id <earning-entry-id>
# Evaluate at most one due candidate / explicitly selected due entry.
npm run earnings:eligibility -- --execute
npm run earnings:eligibility -- --entry-id <earning-entry-id> --execute
```

Structured decision logs show entryId/code/eligible, without provider/private evidence.
`evaluated=true` means one candidate was evaluated, not necessarily promoted. A safe code
can defer it. The CLI never sets amounts, chooses a policy, clears a hold or transfers money.
Unknown financial evidence needs authenticated event recovery and reviewed reconciliation;
no "force eligible" or silent ignore operation is provided.

## Verification and release boundary

`npm run verify` passed: ESLint, OpenAPI validation and **627 tests PASS**, zero failures,
skips or cancellations; test-runner duration **398.91 seconds**. S3-08 adds 32 tests over
the preserved 595-test S3-07 baseline (24 replica-set integration, seven unit/CLI and one
environment test). Source: the commit above plus local S3-07/S3-08 changes; neither local
Story has been committed/pushed here. CLI dry-run, local Markdown/link checks and
`git diff --check` also passed. Tests use only the explicit MONGO_TEST_URI isolated
replica-set database, never the development database.

Coverage includes exact deadline/1 ms early boundary, original policy across later versions,
missing-date future/mature backfill, legacy/mismatched evidence, owned hold history/dedup,
global unassociated/failed financial events, missing refund holds, deferred debts,
suspended/deapproved/orphan accounts, candidate fairness and safe retry backoff, duplicate/
stale/restarted workers, refund admission/finalization races, expiry/shutdown rollback,
complete signed old/current debt with anti-cutoff hiding, capacity failure and blocked
legacy previews. New CLI flag tests reject missing selected IDs before executing a different
candidate; scheduling bounds are validated with Zod.

Real Stripe/Mux/Cloudinary staging, B06
deadline proof, B07/B08 settlement/debt acceptance and qualified review remain **NOT RUN**.
No GitHub action, provider funds movement or production policy activation is part of this Story.
Next: **S3-09 — net payout draft and atomic item reservation**.
