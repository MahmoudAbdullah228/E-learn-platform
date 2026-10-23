# Pending attachment cleanup — PR review follow-up

Date: 2026-10-21. Addresses the supplied Copilot finding on PR #7,
`mediaCleanupQueue.service.js`: a pre-existing due job must not bypass the upload
settlement delay, and a pending asset must not loop indefinitely as an immediate job.

## Changes

- One shared scheduling path handles explicit media removal, replaced images, attachment
  cleanup during lesson/section deletion, and expired-intent sweeping.
- Pending attachment intents are discovered by lesson target as well as attachment IDs;
  unconfirmed intents normally have not yet been attached to `Lesson.attachments`.
- Pending cancellation and cleanup scheduling participate in the target-deletion transaction.
  The asset becomes `deleting` and stores an internal `cleanupNotBefore` deadline equal to
  the latest of cancellation time, intent expiry and provider upload validity, plus five minutes.
  Legacy intents missing provider validity retain the conservative expiry-plus-one-hour fallback.
- Queue upserts use `$max` on `availableAt` so existing due jobs cannot bypass that deadline,
  and existing later retry/lease dates are not shortened by duplicate scheduling.
- The worker independently enforces the asset deadline even if a job becomes prematurely due.
  Legacy unconfirmed `deleting` records without a stored deadline use provider validity/expiry
  as a fallback. Legacy pending jobs are postponed, allowing other due work to proceed.
- Missing/deleted/unhandled assets are not given new dangling cleanup jobs. Ready detached
  attachments still clean up without the pending-upload delay.

## Contract and rollout

`MediaAsset.cleanupNotBefore` is nullable, selected only for internal cleanup reads, and
not part of public DTOs. The new `(targetId, purpose, status)` index supports discovery of
unconfirmed lesson attachments. Existing `_id` and cleanup asset uniqueness indexes remain.
Existing documents remain readable; no destructive migration or secret/config change is needed.

No new HTTP endpoint, controller or Zod request field is required: existing ownership,
validation, response envelopes and frontend flows are unchanged. No OpenAPI endpoint is
added for an internal worker deadline.

Stop/drain old cleanup workers before deploying the updated worker; a worker already running
the previous code does not acquire the new safety check merely because another process was
updated. Initialize the additive index through the normal reviewed deployment process and
check queue age/retry metrics. Do not run `syncIndexes` to drop unrelated indexes.

## Regression coverage

- Pending PDF deletion through both lesson and section routes, including uploads that finish
  after local target deletion; no provider deletion before the deadline, exactly one afterward.
- Premature existing jobs, a job forced due before the deadline, expiry-sweep repair, legacy
  pending references, legacy unconfirmed deleting records, and non-starvation of ready jobs.
- Duplicate scheduling preserves the deadline and one job per asset; missing IDs create no job.
- Queue persistence failure rolls back both cancellation and target deletion.
- Shared policy tests cover all timing boundaries and the missing-provider-validity fallback.

Verification: `npm run verify` passed lint, OpenAPI validation and **432 tests, 0 failed,
0 skipped** (115.02 seconds). Ten new tests supplement the 422-test baseline. The initial
sandboxed integration attempt could not connect to the local replica set; after starting
MongoDB and running with loopback access, all checks passed. Tests use isolated MongoDB
`_test` replica-set data and fake providers; no GitHub push, real provider deletion or
staging acceptance is performed by this change.
