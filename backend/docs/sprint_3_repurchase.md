# S3-07 — Safe repurchase and retained learning progress

Date: 2026-11-18. Branch: `feature/sprint-3-mvp-closure`.
Baseline: `e1314ff8e97aecf12b74292f1697bd3f37c5da39` (S3-06).
Sources: [plan §8.3/S3-07](sprint_3_backend_plan.md),
[policies P12/P13/P14](sprint_3_policy_register.md) and the MVP BR03/BR04 learning flow.
Scope: the existing Checkout, enrollment, payment fulfillment, library and order contracts.
No force-reactivate endpoint, new limiter, provider write, active policy or GitHub action.

## Model and architecture

- `Order.replacesOrderId` is an additive nullable hidden immutable server-owned reference
  to the fully refunded purchase used for admission. Old orders default to null; there is
  no automatic mapping or rewrite of old snapshots. It survives retries/resume and cannot
  be replaced by a client input or a later query update.
- Existing Enrollment status/revocationReason/revocationSourceOrderId/progressRevision
  fields carry the entitlement fence. No new Enrollment or LessonProgress collection is
  needed. The same enrollment ID survives paid/free reentry, retaining lesson history.
- Existing unique(studentId,courseId) Enrollment and partial unique active purchase-slot
  Order indexes prevent duplicate live grants/purchases. Existing Refund order/time index
  supports newest-refund reads. No new index, TTL or destructive migration is required.
- `enrollmentReentry.service.js` centralizes completed full-refund proof, paid grant/free
  reactivation, compare-and-swap source/revocation checks and current progress/resume cleanup.
  Its operations require an active caller transaction. It performs DB work only.
- Checkout/free enrollment keep their existing verified active student/ownership/public
  course checks and user/course write fences. Only a refund-revoked enrollment with matching
  source/revocation order and matching refunded Order/Payment plus succeeded full Refund
  can be admitted. A released slot or a reason string alone is insufficient.
- Paid fulfillment uses the same instructor finance transaction and inbox lease fences as
  S3-06. Payment, order, enrollment, pending sale and processed inbox commit atomically.
  A rolled-back/expired lease cannot partially restore access.
- Order reads load only the newest allowlisted refund projection per page-owned order,
  using one batched aggregation with a five-second bound and no disk spill. They never
  contact Stripe, expose raw evidence or perform financial mutations.

## Behavior and invariants

| Case | Result |
| --- | --- |
| Active enrollment or non-completed refund | No additional purchase; existing access remains active for pending/failed/canceled/partial refund |
| Refund-revoked enrollment with completed matching full refund | Normal Checkout may reserve one new purchase; enrollment stays revoked until trusted paid fulfillment |
| Confirmed paid repurchase | Same enrollment ID; new sourceOrderId/enrolledAt, clear refund revocation, preserve LessonProgress and recompute current completion/resume |
| Fully refunded course is now free | Explicit free-enroll call returns 200, reactivates same ID with null sourceOrderId and no synthetic Order/Payment/Earning |
| Paid attempt pending while price becomes zero | Free reactivation returns PAYMENT_PENDING until the paid attempt is genuinely resolved |
| Independent admin/legal/security/legacy revocation | Admission is refused; no endpoint/body bypass |
| Independent block imposed after valid reservation | Record actual successful payment and its sale; bind the current paid source while keeping the independent enrollment revocation |
| Course archived after reservation | Account actual payment; new learner access follows the existing archived-course policy |
| Old refunded order event after new paid/free grant | Source fencing/idempotent terminal handling leave the current grant untouched |
| Missing/cross-linked financial proof or unexpected enrollment source | Fail closed; never invent a successful refund or overwrite another active source |

Original Order/Payment/Refund and sales remain historical; a repurchase uses the current
server price/revenue split/policy, not the old snapshot. The existing financial guard and
unique indexes still govern accounting. No settlement/eligibility state is relaxed.

`enrolledAt` denotes the latest successful access grant. Old purchase dates remain in
immutable order/history records. LessonProgress IDs/completion timestamps are retained.
Completion is recalculated using existing current-lesson joins: deleted/foreign lessons
are excluded, added lessons can lower completion, zero lessons means zero percent, and a
deleted/foreign resume pointer is cleared. No new curriculum revision feature is introduced.

Refund revocation continues to deny new protected video/PDF credentials and progress writes.
Previously issued credentials can survive until their existing TTL (video ≤15 min, PDF ≤60 sec).
Anonymous previews keep their existing public preview policy; refund is not a preview ban.

## Public contract and frontend handoff

OpenAPI **1.5.0**, **61 paths**; no new HTTP route/controller/middleware is required.
Existing Zod params, strict optional empty Checkout/enrollment bodies, bounded owner-order/
library queries and authentication/role/no-store/rate-limit middleware remain in force.
No client monetary, replacement, source, actor or reactivation fields are accepted.

- `POST /courses/:courseId/checkout`: normal 201 fresh order / 200 resume; 409 for revoked
  independent access, active enrollment or pending attempt as appropriate. Access is still
  based on trusted worker fulfillment, never HTTP/Stripe redirect.
- `POST /courses/:courseId/enroll`: 201 first free enrollment; 200 existing active or explicit
  eligible now-free reactivation. Pending paid attempt is 409 PAYMENT_PENDING.
- Enrollment DTO adds safe revocationReason `refund|restricted|null`, not private reasons.
  Library adds ENROLLMENT_REFUNDED; existing general ENROLLMENT_REVOKED remains.
- Owner/admin order list/detail DTOs add latestRefund null or
  `{id,kind,status,amountMinor,currency,createdAt,completedAt}`. Newest persisted row by
  createdAt/id, not aggregate refunded amount/full history/access authority. A partial
  requires_reconciliation does not imply full refund. No provider ID/key/actor/reason leaks.
- Learning/progress/playback/PDF routes keep existing request contracts and current-source
  authority. The [frontend handoff](frontend-handoff.md) explains new-order polling and
  refreshing the library instead of using an old refunded order to infer current access.

REFUND_PROCESSING_ENABLED remains false by default. S3-06 activation/legacy mapping gates
remain unchanged. No real provider payment/refund, `.env` modification or GitHub mutation
is performed by this Story.

## Verification and remaining acceptance

`npm run verify` passed: ESLint, OpenAPI validation and **595 tests PASS**, zero failures,
skips or cancellations; test-runner duration **191.18 seconds**. This is 18 new tests over
the 577-test S3-06 baseline (16 integration and two unit tests). Source: the baseline commit
above plus these local uncommitted S3-07 changes. Integration tests use the explicitly
isolated MONGO_TEST_URI replica-set database, never development data.

Coverage includes pre-payment denial, protected video/PDF/progress after refund, safe owner
refund reads and privacy, retained completion timestamps and current lesson denominator,
concurrent reservation/idempotent fulfillment, late old events after paid/free grants,
multiple refund/repurchase cycles, now-free reactivation without financial records, pending
paid-attempt exclusion, confirmed expiration, independent/legacy revocations, post-reservation
legal block and archive, pending/failed/canceled/partial refund access, incomplete proof,
deleted resume lessons, strict client inputs, immutable hidden replacement snapshots and
complete rollback when the inbox lease expires. `git diff --check` and new-document link/
Markdown checks also passed. No actual provider funds moved during these tests.
Real Staging B12 repurchase, B04 refund proof, independent qualified review and browser
handoff acceptance remain **NOT RUN** here. S3-08 eligibility and S3-09/S3-10 payouts
remain separate Stories. Next: **S3-08 — eligibility worker, holds and carry-forward**.
