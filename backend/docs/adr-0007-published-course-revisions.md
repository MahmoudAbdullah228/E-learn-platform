# ADR 0007 — Isolated published-course candidates

Date: 2026-11-18. Status: **Accepted**. Candidate editing and audited admin text corrections are implemented in S3-13. S3-14 implements submission, review and atomic publication.
Product decision: P15–P17 in [the policy register](sprint_3_policy_register.md), selected
under the user's delegation. Sources: MVP post-publish rule, BR01/02/05/06/09/10 and the
course-review/learning flowchart. Live access must not disappear during candidate review.

## Decision

Retain the live Course/Section/Lesson model and existing read contracts. A separate normalized
candidate is owned by the instructor and reviewed by admin; it cannot mutate live state.
Do not put an unbounded full curriculum in a CourseRevision document, and do not globally
change Course.status to pending_review when the live published course has a pending candidate.

| Proposed model | Responsibility / indexes |
| --- | --- |
| CourseRevision | courseId/number/baseContentRevision/status/metadata/revision/submit-review decision history; unique(courseId,number), partial unique active candidate/course |
| RevisionSection | revisionId/sectionId logical identity/title/position; unique(revisionId,sectionId), position index scoped to revision |
| RevisionLesson | revisionId/lessonId logical identity/sectionId/position/content/media references/readiness; unique(revisionId,lessonId), parent/position index |

The logical sectionId/lessonId are stable across candidates and live revisions. A candidate
row has its own `_id`; never substitute that row ID for an enrollment lastLessonId or
LessonProgress.lessonId. New logical IDs are server-owned ObjectIds; IDs from another
course/revision cannot be imported through a body. Existing IDs remain valid on publish.

CourseRevision states: draft → pending_review → approved or rejected; approval and live
apply are the **same committed operation**, not a durable approved-but-not-applied gap.
rejected → draft via explicit reopen preserves prior review events; editable candidate
may be discarded with audit and reference-aware cleanup. The status labels and active
flag mapping are fixed in the S3-13 Zod/model contract before code, not client-controlled.

## Readiness, compare-and-swap and promotion

1. Candidate edits write their own revision guard; all material metadata/curriculum/media
   changes go there. Frozen pending candidates cannot accept editor writes.
2. Readiness includes the same required metadata/category/cover/ready video rules as initial
   publication, plus candidate media association and ownership. Define a diff relative to
   baseContentRevision; no undetected live correction/media change may be overwritten.
3. Approval validates active reviewer, owner status, frozen candidate/version, current
   category and media readiness; acquire the existing live course conflict document and
   compare baseContentRevision in the transaction. All writers affecting reviewed content
   must participate in that guard, including provider events and direct text corrections.
4. Apply the validated **changed rows only**, using sequential database work/bulk operations
   within one transaction, retaining logical IDs. Change course metadata/counters and audit
   in the same commit. Readers use the existing snapshot pattern and see either old or new
   content, never a mixed curriculum. No provider network request occurs in the callback.
5. New price affects new Checkout reservations after approval; existing Orders/Payments and
   their policy/split snapshots are unchanged. A pending paid session still fulfills truthfully.

Transaction size is measured on the diff, not assumed to equal total course size. A course
with many unchanged lessons must not be arbitrarily refused just because someone proposed
200 total lessons in an earlier plan. Current limits are 200 direct children per parent,
not 200 lessons per course. S3-13 must benchmark validation/apply work and set an explicit
promotion budget before enablement. If the full material diff exceeds that budget, return
a clear conflict/capacity error with a supported smaller candidate workflow; never truncate
or silently publish a prefix. A scalable version-pointer alternative requires a superseding
ADR and migrated readers, not a second ad hoc publish path. Large-case acceptance is a
measured readiness gate, not a claim already proven in S3-01.

## Media boundary

- Cloudinary/Mux intents and attempts carry course/revision/logical target context. The
  callback resolves that context server-side, not from an untrusted browser-provided live ID.
- Candidate video-ready/failure must update only its candidate state. It must not replace a
  live lesson asset. Current live asset deletion still triggers availability protection.
- Candidate covers/PDFs use signed upload and authenticated PDF rules already established;
  admin/owner review credentials are scoped to the candidate and never public preview access.
- Cleanup requires no active live/candidate/retained rollback references. Retention must
  exceed active credential lifetime and the agreed rollback period; shared assets are not
  orphaned because one candidate was rejected. Recheck/fence before provider deletion.
- Keep existing upload expiry/cleanup settlement protections, especially cleanupNotBefore
  and the worker's independent guard. New revision cleanup must reuse that safety boundary.

## Access, progress and audit

Archived != unavailable != legal/security blocked. Active existing buyers of archived courses
retain access; new discovery/preview/enrollment/Checkout is blocked. Candidate review grants
no ordinary learner entitlement. Owner/admin review privileges do not grant progress writes.

Existing LessonProgress records continue to reference stable lesson IDs. Only current live
curriculum contributes to completion; new lessons can reduce the percentage and current
completedAt. Removed lessons retain safe historical metadata/progress but are excluded from
current counts. Refund repurchase preserves prior progress under P12, not old provider access.

Direct corrections use admin-only title/shortDescription + reason + expectedRevision; they
increment the live content guard and make a stale candidate approval conflict. All other
changes, including description and media/price, use candidate review. This narrows the
earlier tentative instructor corrections route without adding a new public product feature.

## Verification and consequences

Test owner/reviewer isolation, one active candidate, stale base, candidate/role/category/
media races, atomic rollback, callback context, large-diff budget, old Checkout price,
snapshot counts/duration, archived access, stable progress and safe media retention.

Rejected: editing published rows directly then asking admin to review, hiding live content
while candidate is pending, copying every large curriculum into an embedded array, new lesson
IDs for unchanged lessons, and deleting media immediately when rejecting a shared candidate.
The chosen approach adds explicit candidate models and adapter context, but preserves current
public read contracts and avoids a broad content-storage rewrite in this MVP.

## Candidate implementation evidence

Snapshot creation streams the live curriculum in a snapshot transaction, inserting at most
100 lesson rows per batch. List responses contain at most 50 children. An integration
fixture with 205 lessons across two sections verifies exact row count, stable identities,
paging and a second candidate after discard. This measures the editor path only.
Before enabling promotion in S3-14, measure the changed-row transaction budget separately
on the target replica set. No promotion endpoint is enabled by this story.

Version zero is the initial editor version. Each successful write and each material video
transition advances it once. A snapshot keeps inherited asset references without copying
live upload attempts. Only a candidate's own attempts and Cloudinary intents are eligible
for cleanup when it is discarded. The owner and admin credential routes recheck membership,
session and course access after provider work. Discarded snapshots are read-only history.


## S3-14 publication and retention

Approval compares the candidate version and frozen live base, revalidates owner, category,
course access, attachments and videos, and commits the changed live rows, before-images,
decision and audit in one MongoDB transaction. A logical lesson keeps its identifier.
The 250-row publication budget counts changed course, section and lesson rows combined.
The local replica-set boundary test rejected 251, then committed all 250 after one edit
was reverted. The complete fixture, both requests and assertions took roughly two seconds
in the local run. Staging performance depends on document sizes and database latency.

Old media referenced by a before-image is retained. Physical removal of that historical
media requires the O06 retention decision. Existing issued credentials can expire naturally.
New credentials use current live membership or an active candidate review context.
