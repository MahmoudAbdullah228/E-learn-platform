# Sprint 1 / 2 — Gap closure record

Date: 2026-10-05. Scope: the two concrete implementation gaps identified during the
final MVP planning audit. This record does not mark either Sprint or the MVP fully accepted.

## Implemented locally

- STU03 / profile display: `avatarUrl` (nullable) is resolved for own profile reads/updates
  and approved instructor public/profile-update responses. Existing `avatarAssetId` remains
  compatible. Only an owned, correctly targeted, ready Cloudinary avatar with public image
  delivery and an allowed image format resolves. Missing/stale/mismatched/private assets
  return null. No upload signature, secret, provider metadata or private attachment is exposed.
- MVP course-details fields: `sectionCount`, `lessonCount`, `totalDurationSeconds` and
  `unknownDurationCount` use the same snapshot as the returned curriculum. Confirmed positive
  durations are summed exactly with a BigInt intermediate. Missing/not-ready/zero duration
  produces a null total rather than a misleading partial sum. An overflowing sum also returns
  null rather than a rounded integer. Empty legacy curricula return zero counts and duration.
- Removed three deprecated Mongoose `new: true` options in progress and playback-lease
  updates, using the equivalent `returnDocument: 'after'` without changing transitions.

## Architecture / API contract

- Models/indexes: reuse User.avatarAssetId, MediaAsset, Course, Section and Lesson; the
  existing asset `_id` and curriculum parent indexes suffice. No schema migration, new
  collection or denormalized counter is necessary for this read-only enrichment.
- Zod: existing strict profile/instructor/catalog request schemas remain authoritative.
  Display fields are response-only; clients cannot assign an arbitrary avatar URL or ID.
- Controllers/routes: reuse existing profile/instructor/catalog controller and route
  definitions; HTTP success/error envelopes, authorization and validation are unchanged.
- Services: shared avatar resolution in `modules/media/avatarImage.service.js`, injected
  media provider in users/instructors, pure curriculum summary in the catalog module.
- OpenAPI and [frontend handoff](frontend-handoff.md) describe the actual fields. The profile
  response requires avatar fields without requiring authentication responses to include them.

## Verification

- Targeted checks cover upload/confirm/display/update/replace/remove, corrupt associations,
  private/unready/missing images, unconfigured URL fallback, safe totals, unknown duration,
  empty curricula, cross-course isolation and snapshot consistency during concurrent edits.
- Tests use the isolated `_test` replica-set database and fake providers, not application
  data or provider accounts.
- Targeted run: 45 passed, 0 failed, 0 skipped, including the new cases and profile/content
  regressions. The first attempt failed because the local test MongoDB was not running;
  `npm run mongo:local` started the dedicated loopback replica set, and the rerun passed.
- Final `npm run verify` after the deprecation cleanup: lint and OpenAPI validation passed;
  **422 tests passed, 0 failed, 0 skipped**, runner duration 102.13 seconds. Eight new tests
  supplement the 414-test baseline; existing profile validation now also rejects client
  avatarUrl/avatarAssetId assignment explicitly. No production or staging acceptance inferred.

## Still required for Sprint acceptance

The [Staging evidence](staging-evidence.md) remains authoritative. A01–A19 require real
deployment, frontend/provider integration and separate role accounts; local automated tests
do not convert NOT RUN into PASS. No staging origins/frontend build are supplied here.
Only these concrete gaps are closed by this change; any additional finding enters the
final Sprint 3 gap register and is implemented/tested incrementally.

No Git commit/push, provider-account changes, production payment, or staging deployment
is authorized or performed by this gap-closure implementation.
