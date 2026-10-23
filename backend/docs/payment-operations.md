# S2-08 — Stripe Test payment fulfillment and recovery

## Architecture and state

`payments` separates the HTTP controller/routes, Zod event projection, durable inbox,
transactional fulfillment, and local operational recovery. The Stripe adapter owns SDK
calls and raw signature verification; the worker owns leases/retry/shutdown. No provider
requests run inside a MongoDB transaction. MongoDB replica-set transactions are required.

`POST /api/v1/webhooks/stripe` accepts original uncompressed JSON bytes (maximum 1 MiB)
and `Stripe-Signature`, before Express JSON parsing. It requires no JWT or browser rate
limiter. Only platform-account Test Mode snapshot events are accepted. HTTP 200 means
the event was persisted with majority write concern, **not** that a student is enrolled.
Bad signatures/invalid evidence return 400; database failure returns 5xx for Stripe retry.

Configure these event types in the Test Mode Stripe destination:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Valid unsupported events are stored `ignored`. Supported events retain only a small
validated financial projection, hidden from ordinary queries; no customer, card, address,
email, or raw provider-error payload is stored. Unique `(provider,eventId)` deduplicates
delivery; duplicate delivery updates reception time without replacing evidence or reopening
`processed`/`failed` records. There is no TTL on financial/inbox records.

The worker claims a fenced 120-second lease and retrieves the current Checkout Session
with its expanded PaymentIntent. It matches session/intent/order references, test mode,
amount, received amount, currency, and persisted expiry against immutable Order/Payment
snapshots. A paid event plus a currently complete/paid session and succeeded intent is
required. Success updates Order/Payment, creates one active Enrollment and one pending
sale EarningEntry, and marks the event processed in a single snapshot/majority transaction.
Unique student/course and sale/order indexes protect against distinct events arriving
concurrently. Earnings use the recorded instructor split, not the current course price.

Buyer/instructor suspension or course unpublishing after checkout does not discard a
collected sale. Access enforcement is a separate later story. No payout/eligibility
worker, refunds, free enrollments, library/order endpoints, or playback are added here.

Unpaid checkout completion grants nothing; an async success event must follow. Only fresh
expired/unpaid evidence with no intent or a canceled intent releases a pending purchase
slot. Late failures never regress `paid`/`refunded`. A claimed failure cannot cancel a
session that Stripe currently reports as paid. Receipt accounting never trusts redirects.

## Retry, shutdown, and observability

The server initializes indexes before accepting requests, then polls every five seconds,
processing at most ten events per interval. Transient failures back off exponentially
(starting at ten seconds, capped at one hour), with at most eight failed attempts.
Evidence mismatch dead-letters immediately as `PAYMENT_EVIDENCE_MISMATCH`. Other stored
codes are `PAYMENT_EVIDENCE_PENDING` and `PAYMENT_PROCESSING_FAILED`; inspect status/counts,
not raw errors. Monitor failed count and oldest pending/processing event age in deployment.

Shutdown aborts the worker's provider wait and guards transactional stages. An already
dispatched SDK read cannot be recalled, but its late result cannot grant access or consume
a retry. A stopped/expired worker leaves its lease for another worker to recover. An
atomic transaction already committing may complete; financial records cannot partially
commit. Drain waits are bounded by `SHUTDOWN_TIMEOUT_MS`.

## Local operator commands (no public admin fulfillment route)

Use only on a trusted administrator machine with the normal environment configuration.
Commands are **dry run by default**: no database connection or provider call until
`--execute`. Choose exactly one event ID or order ID; no unbounded bulk replay. CLI
access is host-level authorization, not an HTTP admin session. Back up data before repairs.

```powershell
npm run payments:events -- --event-id evt_example
npm run payments:events -- --event-id evt_example --execute
npm run payments:events -- --order-id 0123456789abcdef01234567 --execute
npm run payments:events -- --event-id evt_example --replay --execute
```

Event recovery retrieves authenticated Stripe evidence and feeds the **same inbox**.
Order recovery searches supported Stripe events from order creation to now, bounded to
ten pages of 100 events and at most 100 matching IDs. Every match is retrieved individually
before persistence. Partial/failed scans do not claim successful reconciliation. Stripe's
event API retention is 30 days; older orders are rejected for this recovery mode. At large
account volumes, recover an explicit event ID or resend the original event from Stripe.
If a batch fails after storing earlier events, rerun safely: persistence is idempotent.

`--replay` only reopens a `failed` inbox record with no lease after the operator diagnoses
and fixes the cause. It resets retry state but never edits trusted evidence or reopens a
processed event. It does not require old events to remain in Stripe's history. Queuing a
duplicate already-known event is harmless and does not imply a newly granted entitlement.

An unresolved attempt with no matching verified terminal event keeps its purchase slot;
do not manually mark it paid or infer absence from a timeout. Refunds/disputes and live
payments are out of scope; Test Mode is deliberate.

## Verification and staging gate

```powershell
node --import ./tests/setup-env.js --test --test-concurrency=1 tests/payment-fulfillment.integration.test.js
npm run verify
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to localhost:5000/api/v1/webhooks/stripe
```

Use the listener's signing secret for local development only. With a real server-created
Test Checkout, confirm the resulting Order/Payment, one Enrollment, one EarningEntry,
and processed event. Repeat delivery, test a declined card, stop/restart during delivery,
and exercise explicit recovery. Do not use synthetic `stripe trigger` metadata as proof
of a marketplace purchase: only references to an existing server-reserved order can fulfill.
Automated tests use the isolated `_test` replica-set database and SDK/test doubles; they
do not prove real-account staging acceptance and do not contact Stripe.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment),
[webhook verification and delivery](https://docs.stripe.com/webhooks),
[event retrieval retention](https://docs.stripe.com/api/events/retrieve).

## Recorded automated acceptance — 2026-10-04

- `npm run verify`: lint and OpenAPI contract validation passed; **311 tests passed,
  0 failed, 0 skipped** (about 83 seconds for the test runner).
- S2-08 adds 25 isolated MongoDB/HTTP integration tests and six unit/SDK/CLI tests.
- Covered: raw signatures and payload bounds, durable acknowledgments, safe projections,
  duplicate/concurrent/out-of-order events, financial reference/money/test-mode mismatches,
  transaction rollback, lease fencing, shutdown during provider waits and transactional
  stages, bounded retries, explicit replay, authenticated event recovery, and ledger indexes.
- Existing stories remain covered by the full regression suite. No GitHub operations or
  live Stripe calls were performed. Real Stripe Test Mode staging acceptance remains open.
