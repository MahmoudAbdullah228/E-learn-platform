# S3-04 — Course archive and access policy

Date: 2026-11-18. Branch: `feature/sprint-3-mvp-closure`.
Scope: retain existing entitlements when retiring a course, and independently block
legal/security-sensitive content. Sources: MVP ADM06, BR07/BR09, Sprint 3 §8.2 and
[selected policies P14/P16](sprint_3_policy_register.md). No refund, unarchive, user deletion,
provider asset deletion or new financial processing is introduced.

## Models / indexes

Course adds `archived` status, nullable archivedAt/by/reason, independent
`accessStatus=available|blocked`, accessChangedAt/by/reason and safe `policyRevision=0`.
Reasons and actor/change metadata are hidden from normal model reads. Existing documents
without accessStatus/policyRevision retain the additive available/zero behavior. Unknown
or null accessStatus fails closed in shared access predicates and admission queries.

The additive index `(status,accessStatus,publishedAt desc,_id desc)` supports available
published-course reads alongside current indexes; no index is dropped. Startup already
initializes Course/AdminAuditEvent. No collection backfill or policy activation runs on boot.
Measure the legacy OR query/index plans under representative Staging data before release.

AdminAuditEvent records `course.archived`/`course.access_policy_changed` atomically with
the decision. Archived video failures record a system `course.media_unavailable` event;
they retain status archived and mark unavailableAt, avoiding a reopen/unarchive loophole.

## Layer boundaries / public operations

`modules/courseAdministration` owns Zod schemas, controller, routes, presenter and service.
`modules/courses/courseAccess.policy.js` owns the shared pure rules/query predicates.
`services/adminAuthorization.service.js` reuses S3-03 identity/device transaction fencing;
the user-status service uses the same implementation, preserving last-admin behavior.

| Method / path | Strict body | Success |
| --- | --- | --- |
| POST `/api/v1/admin/courses/:courseId/archive` | `{reason,expectedRevision}` | 200 `{data:{course},message}` |
| PATCH `/api/v1/admin/courses/:courseId/access-policy` | `{accessStatus,reason,expectedRevision}` | 200 `{data:{course},message}` |

Only current active verified admin sessions may mutate policy. Actor/user/device freshness
is checked again inside the transaction. No query keys, extra body fields, client actor,
status, dates or Idempotency-Key semantics. IDs are 24-hex, reasons are trimmed plain text
10–500 chars with raw control/format rejection; revision is a real nonnegative safe integer.
The two mutations share a user-wide `admin-course-policy` quota using existing ADMIN_WRITE
settings; unavailable quota storage fails closed. All outcomes are no-store, including
parser/CORS/auth/quota failures. Existing standardized success/error envelopes apply.

Get the current `revision` from existing `GET /admin/courses/:courseId`, or filtered course
lists. This is the archive/access-policy revision, independent of curriculum edits. A stale
revision always returns `409 STATE_CONFLICT`, even when the requested state now matches.
Same-state + current revision returns explicit no-op without policy/audit changes. It does
not silently replace a reason. Internal actor/device fences can still advance.

Archive admits published/unavailable courses; pre-publication states return
`INVALID_COURSE_STATE`. Already archived + current revision is a no-op. There is no owner
reopen for archived courses. Unblock only changes accessStatus and its audit metadata;
it never changes publication, archive, video readiness or unavailableAt.

Admin policy responses include safe status/revision/timestamps and admin-only last reasons/
actors. Admin course detail includes the same metadata. Owner course responses expose only
safe accessStatus/revision/archivedAt in addition to existing fields; no legal reason leaks.
The catalog remains an allowlisted public DTO. OpenAPI is **1.2.0**, with 58 implemented paths.

## Access table

| Course | Catalog/detail/public video preview | New Checkout/free admission | Active enrolled library/video/PDF/progress |
| --- | --- | --- | --- |
| published, available, media available | Existing behavior | Existing behavior | Allowed |
| archived, available, media available | Hidden / denied | Denied | Allowed for existing active enrollments, paid or free |
| explicit access block | Hidden / denied | Denied | Denied, safe COURSE_ACCESS_BLOCKED code |
| unavailable status or archived with unavailableAt | Hidden / denied | Denied | Denied, safe COURSE_UNAVAILABLE code |
| draft/pending/rejected | Hidden / denied | Denied | History retained, no draft learning-content leak |

Revoked enrollment and suspended/stale user/session do not gain an archive exception.
Current approved owners/admins can inspect unblocked draft/unavailable/archived media for
review where the individual asset is ready, as before. They cannot issue video/PDF through
an explicit access block; there is no legal/security reviewer bypass in this MVP.

Library entries add `availabilityCode`: AVAILABLE, COURSE_ACCESS_BLOCKED,
COURSE_UNAVAILABLE or ENROLLMENT_REVOKED. Available course metadata adds status/archivedAt
for an archive banner. Unavailable/blocked course/progress are null in the library; enrollment
history stays. Learning details, signed playback, private downloads, completion and resume
all use the shared table. Blocked submissions/publication cannot bypass policy via review.

## Concurrency / provider boundary

Archive/access updates and audit commit in one snapshot/majority transaction. Actor and
device writes fence suspension/logout/reset. The Course update conflicts with Checkout,
free-enrollment, progress and video lifecycle transactions on the same document. Concurrent
admin commands sharing a policy revision have one winner; retry must reread current state.
Audit failure rolls back policy and fences. No external call runs in these transactions.

A Checkout reservation admitted before archive/block can still complete against its
immutable financial snapshots. Trusted signed payment fulfillment still records one paid
Order/Payment/Enrollment/Earning rather than losing a real receipt. It does not clear the
later archive/block or grant a credential that bypasses access policy. New reservations
after policy commit are rejected; no provider session is created for them.

Video/PDF services recheck fresh policy after provider preparation/signing before returning
credentials. Anonymous preview archived during signing is withheld; an enrolled archived
learner remains entitled, but an intervening legal block withholds the response. Previously
issued credentials can last until expiry (video <=15 minutes, PDF <=60 seconds). Public cover
URLs/cached media also are not retroactively invalidated by a MongoDB status change; any
provider takedown/invalidation requires its own authorized operational procedure.

## Verification / delivery

Deploy compatible code/indexes to every backend instance before enabling archive/access
mutation traffic (for example a maintenance window or temporary ingress restriction on the
two mutation paths). Old binaries deny archived learner access and ignore accessStatus;
do not serve them alongside policy-enabled instances. Take a backup and verify B02 first.
Rolling back to a pre-S3-04 binary after policy writes is unsafe: do not erase archive/block
history as a rollback shortcut. Keep compatible access enforcement and use a reviewed
operational rollback/migration procedure.

Final `npm run verify` on 2026-11-18: lint and OpenAPI validation passed;
**509 tests PASS, 0 failed, 0 skipped, 0 cancelled** (145.79 seconds). This adds 25
regressions over the S3-03 484-test baseline.
Targeted cross-module regressions: **140/140 PASS**, including S3-03 session/admin behavior,
archive/block/rollback/concurrency, enrolled media/progress and signed payment processing.
Additional quota/free-admission/unavailable-archive cases are included in the final suite.
Tests use the isolated `_test` replica set and fake providers; application users/content
and provider projects are untouched. B02 Staging/qualified review remains NOT RUN.

Source baseline: `e6f9f5b` plus this local uncommitted patch. No Git commit/push is performed
for S3-04. S3-05 now has [guarded local evidence](sprint_3_refund_requests.md);
next is S3-06. These local changes have not been committed/pushed.
