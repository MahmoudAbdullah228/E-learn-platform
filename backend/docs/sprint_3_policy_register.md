# Sprint 3 — Policy register

Version: `mvp-s3-policy-v1`. Recorded: 2026-11-18.

Status: **Accepted for implementation of the Test Mode MVP**, not implemented by this file.
Authority: the user explicitly delegated the three product choices on this date: choose
what best fits the project. BE1 selected the decisions below under that delegation. This
does not mean a named legal/security reviewer approved a commercial refund policy.

References: [MVP](../../docs/final_MVP.md), [Project Plan](../../docs/Project_Plan.md),
[financial ADR](adr-0006-financial-integrity-and-settlements.md),
[content ADR](adr-0007-published-course-revisions.md).

## 1. Accepted decisions

| ID | Decision | Rationale / guard | Implementation |
| --- | --- | --- | --- |
| P01 | Full refunds only in the product API, initiated by an active admin; Stripe Test Mode, EGP | Completes the MVP without partial-refund product complexity; external partial truth is held/reconciled, never ignored | S3-05/06 |
| P02 | Standard refund window: 14 elapsed days (`1,209,600` seconds) from trusted provider payment confirmation | Clear deterministic UTC duration, not 14 business days or Cairo midnights; it is a project policy, not a legal entitlement claim | S3-02/05/08 |
| P03 | A standard request is admitted only when its transaction decision time is strictly before `refundDeadlineAt`; at/after the boundary an exception is needed | The finance guard serializes refund/payout decisions; an open browser form does not reserve eligibility | S3-05/08 |
| P04 | An admin may request a late full refund with explicit `overrideWindow: true` and a required audited reason | Needed for justified refunds after settlement. Overrides the time window only, never amount, ownership, provider truth, duplicate/unknown-refund guards or legal blocks | S3-05/06 |
| P05 | Sale earnings become eligible at the deadline, only without unresolved financial holds/refunds | Eligible does not mean paid. Opening a refund atomically places a hold before contacting the provider | S3-08 |
| P06 | Store an immutable policy version at Checkout creation; derive deadline/eligibility from trusted confirmation on fulfillment | Old purchases do not move when env/config or policy changes. The new policy is inactive until the implementation deploys an explicit effectiveFrom | S3-02/06/08 |
| P07 | Preserve the original 20/80 snapshot; provider fees are borne by the platform | A refund uses the original instructor share. Do not recalculate from the current course price or show commission as net accounting profit | S3-02/06/11/12 |
| P08 | Successful refund before an unreserved settlement reverses the due; after a paid settlement, carry a negative adjustment into the next settlement | No double debit, erased debt, or edits to a paid historical payout | S3-06/09/10 |
| P09 | A pending/sealed transfer has immutable amount/items; unknown outcome blocks another payout until reconciliation | Pending is not proof no bank transfer occurred; manual transfers cannot be atomic with MongoDB | S3-09/10 |
| P10 | One active payout per instructor/currency; monthly periods in Africa/Cairo, UTC half-open boundaries, include all earlier unsettled earnings/debt up to cutoff | A month is not 30 days. The client cannot choose only positive entries or submit the payable amount | S3-09/10 |
| P11 | Suspend new instructor payouts while the instructor account is suspended, but preserve all liabilities and record facts of already executed transfers | Suspension is not forfeiture; users cannot log in or issue new sensitive actions using stale JWT roles | S3-03/08/10 |
| P12 | Repurchase after successful full refund reactivates the same enrollment with the new sourceOrderId; retain historical progress and recalculate on current lessons | BR03, unique(student,course), no old-refund revocation of the new purchase. Independent admin/legal revocations are never bypassed | S3-07 |
| P13 | If a fully refunded course becomes free, the free-enrollment route may reactivate only a refund-revoked enrollment | No synthetic free Order/Earning; no revival of an independent access block | S3-07 |
| P14 | Archived courses disappear from discovery/preview/new purchases, while existing entitled students retain learning/PDF/progress | BR09; unavailable media and legal/security block remain distinct. Existing confirmed charges must still be accounted for | S3-04 |
| P15 | Keep the live published version available while a material candidate is reviewed; price/content/cover/video/PDF changes become visible only on approval | Protects purchasers and orders in flight; pending/rejected candidate does not turn the live course into pending_review | S3-13/14 |
| P16 | Direct text correction is a narrow audited admin action for title/shortDescription; instructors submit changes through candidates | Conservative implementation of the MVP simple-correction exception: API cannot reliably infer whether rewritten prose changes the educational promise. Description, curriculum, commercial/media fields require review | S3-13/14 |
| P17 | Stable lesson identities; added published lessons can reduce progress and remove current completion until newly completed | BR05/06. Historical progress is retained for removed lessons but excluded from current counts; no certificates introduced | S3-07/14 |
| P18 | Basic student profile remains name + avatar for this MVP; instructor bio/expertise/links continue as implemented | No extra PII, editable email, role editor, phone/address, or invented account-management scope | S3-18/19 |

P16 tightens the earlier proposed instructor corrections route: use
`PATCH /admin/courses/:courseId/corrections` with reason and expectedRevision. The instructor
uses the candidate editor even for text changes; admin corrections must be semantically
minor, and a material change must use review. Audit is a human accountability control,
not a claim that text semantics can be perfectly validated automatically.

## 2. Time, policy activation and historical data

S3-07 implements P12/P13 with completed source-proof and retained-progress evidence;
see [repurchase behavior/verification](sprint_3_repurchase.md). These local tests do not
replace real Staging B12 or activate the default-disabled Test refund issuance gate.

S3-08 implements dated positive eligibility under P05/P06 and signed carry-forward safety
under P08/P09; see [eligibility evidence](sprint_3_earnings_eligibility.md). A historical
positive cutoff cannot hide already-known eligible negative debt; all such debt remains
in the current preview. No periodStart filtering or first-N positive-only total is allowed.
Unknown transfer debt remains pending for S3-10; no financial hold is auto-resolved here.

- `paidAt` remains the compatibility processing timestamp and never starts the 14-day clock.
  S3-06 now records a separate trusted confirmation fact for new fulfillment; see
  [implementation and rollout boundaries](sprint_3_refund_finalization.md).
- `paymentConfirmedAt` comes from validated authenticated successful Stripe event evidence,
  corroborated by the current paid session/intent. Preserve existing `paidAt` compatibility
  and the inbox processedAt; document these timestamps separately in the contract.
- `checkout.session.completed` while unpaid is not a successful confirmation. For supported
  later-success events use that successful event's provider timestamp, not the earlier unpaid
  event, event delivery time, client time, or PaymentIntent creation time. Validate timestamp
  units, plausibility and associations; duplicate delivery cannot move it forward.
- `refundDeadlineAt = paymentConfirmedAt + refundWindowSeconds` and `eligibleAt` use the
  policy version fixed for that Checkout. No pending Checkout is given a fictitious paid date.
- Historical purchases without provider time/policy need an explicit mapping and provider
  reconciliation. Do not rewrite financial history or assume the newest policy applies;
  unresolved legacy dues remain held until the report is reviewed.
- Accepted policy date is not effectiveFrom in the running app. It becomes effective only
  with reviewed deployment/configuration; version rows are immutable, not an editable env knob.

## 3. Operational decisions still requiring evidence

These do not reopen P01–P18. They are deployment/capacity facts, not invented approvals.

| ID | Required input / recommendation | Owner role / deadline | Blocks |
| --- | --- | --- | --- |
| O01 | Backend/frontend Staging origins, deployment IDs, dedicated provider resources and demo mailboxes | BE1 + FE3, before first real Staging run | S3-16 and final acceptance, not isolated model tests |
| O02 | Named reviewers, especially qualified money/security review before commercial operation | Product representative + team, before release sign-off | Commercial readiness; contract review assigned to FE3 |
| O03 | Representative dataset, latency/load budget and max transaction work based on measurements | BE1, during S3-02 and before S3-09/S3-13 readiness | Large-payout/promotion implementation acceptance |
| O04 | Backup schedule/retention and measured RPO/RTO, incident owner and alert thresholds | BE1 + deployment operator, S3-15 before Staging acceptance | Operational sign-off |
| O05 | Confirm actual BE1/FE capacity and final delivery date; no extra hours assumed | Product representative + team, before committing a delivery date | Calendar promise, not scope coverage |
| O06 | Media retention/rollback window and physical cleanup eligibility measured against active references/issued credentials | BE1, before S3-14 cleanup enablement | Revision media deletion, not baseline Auth/catalog |
| O07 | Verify/rotate any previously exposed provider secrets in a coordinated operation | Credential owner + BE1, before Staging credentials are used | External provider execution; no rotation performed here |

The 101–149-hour plan remains an initial forecast. Already completed display/cleanup work
must not be charged again; S3-18 is a residual audit, not a repeat implementation. No new
numeric delivery commitment is made before O05 or remaining-gap measurements.

## 4. Change control

Product changes get a new policy version, impact assessment and tests. S3-01 files do not
change `.env`, seed a database policy row, publish an endpoint, send a refund, move money,
or authorize GitHub/hosting/provider-account changes. Financial policy here is the chosen
Test Mode product behavior, not legal/financial advice about live operation.
