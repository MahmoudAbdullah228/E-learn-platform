# S3-10 — Manual payout settlement

Admin endpoints under `/api/v1/admin/payouts/{payoutId}` accept an `Idempotency-Key`
and the `expectedRevision` from GET. The command response is `{ data: { payout: { id,
status, revision } } }`. An identical retry returns its original receipt even after a
later transition. Fetch the current record before acting on a prior receipt.

| Command | State | Input in addition to `expectedRevision` | Outcome |
| --- | --- | --- | --- |
| `POST /submit` | `draft` | `transferMethod` | Seals the amount and signed items, allocates a server UUID attempt, records the operator and blocks further payouts. |
| `POST /mark-paid` | `pending` | `transferAttemptId`, `transferMethod`, `confirmedAmountMinor`, `transferReference` | Records a confirmed transfer with the exact sealed amount. |
| `POST /cancel` | `draft` or `pending` | `reason` for a draft. For a pending attempt also include `transferAttemptId`, `transferMethod` and `evidenceReference`. | Cancels and releases eligible claims after verified non-transfer. |
| `POST /reconcile` | `pending` | `transferAttemptId`, `transferMethod`, `reason` and `outcome`. Use `confirmedAmountMinor` and `transferReference` for `confirmed_paid`, or `evidenceReference` for `confirmed_not_sent` and `unknown`. | Records the investigated outcome. `unknown` retains the attempt and claims. |

Sealing applies the instructor admission fence, revalidates the exact reserved set,
and checks current financial holds and evidence. A changed selection returns
`PAYOUT_SELECTION_CHANGED`. Cancel the draft and create a fresh one from a new preview.
Suspension blocks creating or sealing a payout. An active admin can still record an
already executed transfer for a suspended instructor. All transitions revalidate
the admin and device session inside the transaction. A stale revision or inconsistent
transfer proof returns 409. A confirmed paid payout is final.

The API records facts attested by the operator. Use an opaque reference to reliable
external evidence and keep the supporting evidence in the operator's approved system.
Use the same sealed attempt ID throughout reconciliation. If evidence is inconclusive,
record `unknown` and investigate the original attempt before initiating any transfer.
The API has no bank or Stripe payout integration. Simulation uses `test_simulation`
and references starting with `SIM-` in Stripe Test Mode or the automated test environment.
Use only simulated transfers for MVP acceptance. Successful transfer references are
normalized and globally unique. Deploying the new unique index requires checking for
duplicate historical references first if the database has imported payout records.

A confirmed refund for a sealed payout holds a pending refund adjustment. When a
transfer is confirmed paid, that adjustment becomes eligible negative carry. If no
transfer occurred, the refunded sale and its pending adjustment are reversed and
remaining claims are released. The original payout items remain available for audit.
Only holds associated with the resolved attempt and its proven dependencies are closed.
Payout state, ledger, audit receipt and active claim pointer commit together.

`npm run verify` passed locally with the isolated MongoDB replica set. All 639 tests passed,
along with lint and OpenAPI validation.
Staging acceptance covers simulated transfer and refund scenarios B08–B11.
