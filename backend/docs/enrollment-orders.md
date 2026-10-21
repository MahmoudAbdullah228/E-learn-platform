# S2-09 — Free enrollment, library, and order reads

## Scope and architecture

Feature modules `enrollments` and `orders` each have Zod schemas, explicit DTO presenters,
controllers, routes, and domain services. Shared pagination and no-store policy live in
`utils` and `middlewares`. Existing Enrollment, Order, and Payment models are reused;
no duplicate model, fake financial record, provider call, or new payment-fulfillment path.

Enrollment retains unique `(studentId,courseId)` and status-filtered library indexes,
adding `(studentId,enrolledAt desc,_id desc)` for all-status reads. Order gains
student/status/history and course/history indexes. No TTL deletes historical records.

## Implemented API (all under `/api/v1`)

| Method / path | Role / result |
|---|---|
| POST `/courses/:courseId/enroll` | Verified active student, free published course; 201 new / 200 already active |
| GET `/users/me/courses` | Own library, status active/revoked/all, default active |
| GET `/users/me/courses/:courseId` | Own active enrollment and published learning outline |
| GET `/users/me/orders` | Own immutable order history, optional status filter |
| GET `/users/me/orders/:orderId` | Own read-only polling, safe Payment DTO |
| GET `/admin/orders` | Admin snapshots, status/studentId/courseId filters |
| GET `/admin/orders/:orderId` | Admin financial split snapshot and safe Payment DTO |

Every route requires a live bearer session, current active account and verified email.
Student routes require student, administrative routes require admin. A non-owned/missing
order produces identical `404 ORDER_NOT_FOUND`; a missing/revoked/non-owned enrollment
produces `404 ENROLLMENT_NOT_FOUND`. All successes/errors are no-store.

Lists accept page=1 and limit=20 (maximum 100, page maximum 1,000,000) and return stable
newest-first ordering with ID tie-breakers and `{page,limit,total,totalPages}`. Strict Zod
rejects invalid, duplicate, and unknown query fields. Counts, joins, curriculum, and
Order/Payment reads use sequential queries in one MongoDB snapshot transaction.
An in-flight response can retain its original authorized/published snapshot, never mixed
new draft/payment content; later requests observe the changed state.

## Enrollment invariants

Send no body or `{}`. No studentId, money, role, status, or order reference is accepted.
Only a published free course can create an enrollment. Owner enrollment returns
`403 OWN_COURSE_ENROLLMENT_NOT_ALLOWED`, paid enrollment returns
`409 PAID_COURSE_REQUIRES_CHECKOUT`, hidden/missing course returns 404.

The transaction rechecks and writes the User/Course reservation revisions shared with
Checkout, then creates one active Enrollment with sourceOrderId=null. Repeated active
enrollment returns the same record without replacing its source or study state, including
after the price changes. Revoked access is never auto-restored: `409 ENROLLMENT_REVOKED`
also prevents checkout until the future refund/repurchase policy. Checkout rejects
already-active free/paid enrollments as `COURSE_ALREADY_ENROLLED`.

A reserved purchase blocks a new free entitlement (`409 PAYMENT_PENDING`) even if the
course later becomes free. This protects financial fulfillment from a competing free
grant. Never infer failed payment from local expiry, redirects, or polling. Free enrollment
creates no Order/Payment/EarningEntry and calls no provider. Errors roll back reservation writes.

## Library and learning outlines

Library is `{courses:[{enrollment,course,available}],pagination}`. Course contains only
id/slug/title/shortDescription/level/language/confirmed public cover URL. Missing or
nonpublished courses remain historical entries with course=null and available=false,
without draft text. Revoked entries are hidden by default, visible with status=revoked/all,
but available=false and unable to read curriculum.

Outline is `{enrollment,course}` with description, requirements, learning outcomes, ordered
sections, and lessons containing title/description/position/durationSeconds/videoStatus/
isPreview. S2-10 adds an `attachments` array of ready private PDF database IDs for authorized
download discovery; no provider IDs, signed URLs, or upload IDs are exposed. A
nonpublished/deleted enrolled course returns `409 COURSE_UNAVAILABLE`. A deleted,
foreign, or unavailable lastLessonId becomes null on library/outline reads.

S2-11 adds dynamic progress summaries to available library entries and the learning outline,
plus per-lesson completed/completedAt. Unavailable/revoked entries have progress=null.
Enrollment completedAt in reads is reconciled with the current curriculum, not used as a
percentage source. See [learning progress](learning-progress.md) for writes and invariants.
Protected playback/downloads use the separate S2-10 endpoints; this remains an outline,
not a video-access endpoint. See [protected learning access](protected-learning-access.md).

## Orders and frontend polling

Lists contain order snapshots; detail is `{order,payment}`. Missing Payment is null so
history remains readable for operational review. Owner orders contain id/courseId/
courseTitle/amountMinor/currency/status/expiresAt/createdAt/paidAt. Admin orders also
contain studentId/instructorId/commissionBps/platformAmountMinor/instructorAmountMinor.
Safe Payment contains only id/provider/status/amountMinor/currency/paidAt. No emails,
provider references, idempotency keys, leases, raw errors, or checkout inputs are exposed.
Reads never mutate enrollment or financial records and never call Stripe.

Poll after Checkout every 5 seconds, back off to 30 seconds, stop after two minutes and
offer manual refresh. A timeout does not mean failure and must not start another checkout.
Only the verified event worker confirms payment; a paid result can refresh the library.
Refund/payout/admin mutation endpoints remain deferred.

## Limits and verification

- `ENROLL_RATE_LIMIT_MAX=10`, window 60000 ms: user-scoped across all courses.
- `PRIVATE_READ_RATE_LIMIT_MAX=120`, window 60000 ms: one shared user bucket across
  library, owner polling/history, and administrative order reads.
- 429 `RATE_LIMITED` includes Retry-After. Shared-store failure returns safe 503
  `RATE_LIMIT_UNAVAILABLE`, without silent fallback or enrollment writes.
- Memory stores support one API instance; multiple instances require namespace-specific
  shared stores. Both limits already have Zod environment validation and configurable windows.

```powershell
node --import ./tests/setup-env.js --test --test-concurrency=1 tests/enrollment-orders.integration.test.js
npm run verify
```

Use the isolated `_test` replica-set database, never concurrent integration suites against
the same database. Coverage includes idempotent concurrent free enrollment, payment-slot
conflicts, live roles/sessions, ownership, safe DTOs, unavailable entries, snapshot reads
during payment/draft changes, rollback, and shared quotas. Real Stripe Test Mode and
frontend staging acceptance remain separate release gates.

## Recorded automated acceptance — 2026-10-04

- `npm run verify`: lint and OpenAPI validation passed; **337 tests passed, 0 failed,
  0 skipped** (about 89 seconds for the runner).
- S2-09 adds 22 isolated MongoDB/HTTP integration tests and four unit/schema/presenter/index tests.
- Canonical OpenAPI now exposes 49 paths, including seven new S2-09 paths. Existing
  Checkout, payment fulfillment, authentication, and earlier story regressions passed.
- No live provider calls or GitHub operations were performed. Protected media access,
  progress, and real frontend/Stripe staging proof are not claimed complete by these tests.
