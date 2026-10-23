# S2-11 — Lesson completion, resume and dynamic progress

## API contracts

All paths are under `/api/v1`, use a live Bearer session, and require a current active
verified student with an active enrollment in a published course. Owner/admin review and
anonymous preview access never bypass enrollment. No query parameters are accepted.

`PUT /users/me/courses/:courseId/lessons/:lessonId/progress`, body `{completed:boolean}`:

```json
{
  "data": {
    "lessonProgress": {"lessonId":"507f1f77bcf86cd799439011","completed":true,"completedAt":"2026-10-04T10:00:00.000Z"},
    "enrollment": {"id":"507f1f77bcf86cd799439012","courseId":"507f1f77bcf86cd799439013","sourceOrderId":null,"status":"active","enrolledAt":"2026-10-01T10:00:00.000Z","completedAt":null,"revokedAt":null,"lastLessonId":null},
    "progress": {"totalLessons":2,"completedLessons":1,"percentage":50,"completedAt":null}
  }
}
```

`PUT /users/me/courses/:courseId/last-lesson`, body `{lessonId}`: returns
`{data:{enrollment,progress}}`, without a lessonProgress field. Setting resume position
does not mark completion. Completion writes do not advance resume automatically; only an
invalid/deleted/foreign existing resume reference is cleared as a repair.
Both endpoints return 200, including idempotent repeats. No client-owned enrollment IDs,
student IDs, timestamps, percentages, source orders or provider IDs are accepted.

Existing `GET /users/me/courses` adds progress to each available entry; missing/nonpublished
courses or revoked enrollments return progress=null. `GET /users/me/courses/:courseId`
adds top-level progress and completed/completedAt for each current lesson. Private provider
identifiers and media credentials remain excluded. Null lesson completion means incomplete.

Errors: 400 strict Zod validation, 401 invalid/inactive/unverified/current-session failure,
403 missing student role, 404 `ENROLLMENT_NOT_FOUND` for missing/revoked/non-owned enrollment,
404 `LEARNING_CONTENT_NOT_FOUND` for missing/foreign lesson, 409 `COURSE_UNAVAILABLE` for
an enrolled but unavailable course. All errors use the shared safe envelope.
Successes and errors are `Cache-Control: no-store`, including malformed JSON and CORS errors.

## Data and invariants

- LessonProgress: enrollmentId → Enrollment, lessonId → Lesson, completedAt nullable, timestamps.
  Both references are immutable. Unique `(enrollmentId,lessonId)` prevents duplicates;
  `(enrollmentId,completedAt)` supports completion queries. No TTL deletes learning history.
- true stores the first completion timestamp and preserves it on repeats. false writes null
  and is idempotent even without previous completion. Re-completion gets a new timestamp.
- Writes lock the current User, RefreshSession, Enrollment and published Course within one
  MongoDB transaction, then verify the lesson's section belongs to the same course. Hidden
  learning/progress revision counters fence concurrent suspension, role/version/session
  revocation, enrollment revocation, publication/curriculum changes, and overlapping writes.
  No provider I/O or financial record writes are involved. Mid-transaction failures roll back
  progress, resume/completion metadata, and revision writes together.
- Different lesson completions and completion/resume updates are serialized without losing
  either state. Contradictory concurrent writes have commit-order semantics, not guaranteed
  browser submission order; frontend should coordinate them and reload authoritative state.
- Revisions on shared User/Course documents deliberately favor correctness at MVP scale.
  High-volume learning workloads will need contention benchmarking before redesigning locks.

## Dynamic calculation

The denominator is **all existing lessons in the currently published course's existing
sections**, including previews. Temporary video readiness is not used to shrink the
denominator and incorrectly inflate completion. A provider-deleted video normally makes
the whole course unavailable through the existing video lifecycle; it grants no progress
write bypass. Completion is self-reported, not a proof of video watching.

The numerator joins this enrollment's nonnull completion records to existing lessons and
sections belonging to that exact course. Deleted lessons/sections, orphan records, records
from other courses or students are ignored. Counts and DTOs share one read snapshot.
Reads are batched aggregates rather than one progress query per library entry.

Percentage is `floor(completedLessons / totalLessons * 10000) / 100`; 2/3 is 66.66%, an
incomplete course cannot round to 100%, and zero lessons is 0%. completedAt is the latest
relevant lesson-completion date only when a nonempty current curriculum is fully completed.
Writes persist that value in Enrollment atomically. Reads derive it dynamically, overriding
a stale stored value if curriculum changed; they do not mutate data just to display it.
Read the percentage from progress, never infer it from Enrollment.completedAt or lastLessonId.
Publishing/editing new curriculum after publication remains Sprint 3's versioning policy;
these dynamic calculations do not authorize currently forbidden instructor edits.

## Request limits and verification

`learning-progress` is one user-wide bucket for completion and resume across every course/
lesson: `LEARNING_PROGRESS_RATE_LIMIT_MAX=60`, window=60000ms by default. It is separate
from `private-read` and learning-media access. Limits execute after auth but before expensive
validation/domain writes; rejected domain attempts still count. 429 returns `RATE_LIMITED`
and Retry-After; store failure returns safe 503 `RATE_LIMIT_UNAVAILABLE`, with no writes.
Use a shared namespaced store before multi-instance deployment; memory is single-instance only.

```powershell
node --import ./tests/setup-env.js --test --test-concurrency=1 tests/progress.integration.test.js tests/progress.unit.test.js
npm run verify
```

Tests cover idempotence, complete/uncomplete, zero/new/deleted/foreign/orphan lessons,
multiple students, snapshot reads, uniqueness/immutability, concurrency, rollback, live
authorization and quota isolation. Tests must use the explicitly isolated replica-set test
database, never development data. No backfill is required: missing records mean incomplete;
startup initializes the new model/indexes. Existing enrollments/references/hashes are preserved.

S2-12 must still prove the actual browser/provider flow: verified paid/free enrollment,
authorized playback/PDF access, progress writes, resume after reload, and denied writes
for revoked/suspended users. Automated tests do not replace that staging acceptance.

Local verification (2026-10-04): `npm run verify` passed lint, OpenAPI contract validation,
and **401 tests: 401 passed, 0 failed, 0 skipped** on the isolated replica-set test database.
S2-11 adds 26 integration and 4 unit tests. The local test replica set was restarted after
an initial connection failure; no development database or live provider was used.
