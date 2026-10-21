# Sprint 2 delivery evidence

## Release identity

- Source revision + uncommitted patch identity: NOT RECORDED
- Deployment/build identifier: NOT DEPLOYED
- UTC test window / operator: NOT RECORDED
- Backend / frontend staging origins: NOT PROVIDED
- Dedicated MongoDB environment verified (no URI/secrets): NOT RECORDED
- Provider Test/Staging projects and approved asset budget (no keys): NOT RECORDED
- Backup/restore evidence and rollback owner: NOT RECORDED

## Automated evidence

Most recent completed baseline before S2-12: 2026-10-04, `npm run verify`, **401 passed,
0 failed, 0 skipped**, isolated `_test` replica-set MongoDB, mocked providers.
S2-12 regression: 2026-10-04, `npm run verify`, lint and OpenAPI validation passed;
**409 tests passed, 0 failed, 0 skipped**, runner duration 225.28 seconds. The eight new
tests cover strict CLI arguments, read-only aggregates on isolated MongoDB, empty queues,
age/field projection, query failure, no-connection dry run and sanitized CLI errors.
The final CLI changes were also separately linted and its unit tests rerun successfully.
Sprint 1/2 concrete gap closure, 2026-10-05: `npm run verify` passed lint and OpenAPI
validation with **422 passed, 0 failed, 0 skipped** (102.13 seconds), after local test MongoDB
startup. Avatar-display and curriculum counts/duration regressions are documented in
[the closure record](sprint_1_2_closure.md). This is isolated local/fake-provider evidence;
the staging acceptance rows below remain NOT RUN.
PR #7 pending-upload cleanup follow-up, 2026-10-21: `npm run verify` passed lint/OpenAPI
and **432 tests, 0 failed, 0 skipped** (115.02 seconds). Ten regression cases cover safe
pending cancellation, legacy queued jobs and rollback; see [the cleanup review record](media-cleanup-review-fix.md).
This is isolated local test evidence only; no live asset was deleted and no staging case
was marked PASS by this run.
`git -c core.autocrlf=false diff --check` and `npm run staging:status` dry run passed.
No staging provider calls, real Checkout, deployment, demo seeding or GitHub writes were
performed. This is not live staging/provider evidence.

## Real acceptance

### Local development smoke — 2026-10-04 (not staging acceptance)

- Started the API on localhost:5000 with the configured development replica-set database.
- Started a local-only Mailpit SMTP catcher on 127.0.0.1:1025, UI on 127.0.0.1:8025.
- Created one synthetic student account through HTTP, captured its verification email
  locally, verified it, logged in, read its private profile, rotated refresh credentials,
  logged out, and confirmed its access token subsequently returned 401. All six smoke
  stages passed. The demo record remains in the development database; no external email
  was sent and no passwords/tokens were recorded here.
- Read-only provider checks: Mux API accepted credentials; Stripe API confirmed Test Mode.
  A local Mux playback JWT signing check passed with 900-second lifetime; no actual video
  playback, upload, payment or fulfillment was exercised.
- Cloudinary image preset lookup returned 404. The configured PDF preset exists and is
  signed, but its settings contain delivery type `upload` and no `allowed_formats` or
  `max_file_size`. The backend explicitly signs `authenticated` delivery for PDF requests;
  these findings are preset configuration gaps, not proof of a publicly exposed PDF.
- Cloudinary account settings were **not** changed. Real media upload/privacy and full
  Stripe Checkout/webhook acceptance remain outstanding. API, SMTP catcher and Stripe
  listener are temporary local development processes, not a deployed staging service.

### Follow-up live PDF adapter diagnostic — 2026-10-04

- Configuration and local API/Mailpit reachability passed. The PDF preset now has signed
  mode, authenticated delivery and `allowed_formats: [pdf]`; the image preset still returns
  404. No Mux assets were available for a real playback proof.
- Corrected the earlier size-limit assessment: no `max_file_size` in a preset is **not** a
  missing Cloudinary setting. Per-preset size limits are unsupported; backend confirmation
  must enforce application limits and account limits apply to provider uploads.
- Uploaded one dedicated 68-byte raw PDF. Cloudinary returned a public ID ending in `.pdf`
  and no `format` field. The current adapter/domain expects an extensionless public ID and
  `format: pdf`, so the live result does not satisfy current confirmation assumptions.
- Unsigned authenticated delivery returned 401. The current private-download adapter URL
  returned 404; a control signed URL using the actual raw public ID returned 200. No URL,
  signature, password or token is recorded here. Expiry and browser learning-access proof
  were not executed. This is an **open backend integration defect**, not a passing gate.
- The initial cleanup attempt using the expected extensionless ID did not remove the
  uploaded resource. Retrieved the exact dedicated proof record, checked its creation time
  and 68-byte size, then deleted its actual `.pdf` ID; provider confirmed `result: ok`.
  No pre-existing user asset was deleted. The local diagnostic helper cleanup was corrected.
- No application fix was implemented during this diagnostic-only request. Real course
  publishing, Checkout payment, durable fulfillment and progress journey remain untested.

### PDF adapter repair and image configuration — 2026-10-04

- Fixed extension-bearing raw PDF IDs for new intents and legacy extensionless IDs in
  inspection, authenticated download and cleanup. Confirmation handles missing raw format
  metadata but still rejects mismatched ID/type/resource/format and oversized files.
- The follow-up real PDF adapter proof passed upload, trusted inspection and authenticated
  signed download. Unsigned authenticated access returned 401. Cloudinary confirmed deletion
  of the dedicated proof resource. This resolves the PDF integration defect above; it does
  not prove browser authorization, URL expiry or the complete learning journey.
- Found a credential URL mistakenly stored as the image preset name. Replaced the local
  value with `elearning_signed_images`; configuration now rejects credential URLs in either
  preset field without echoing their values. Created only this dedicated signed image preset
  with JPG/JPEG/PNG/WebP formats, upload delivery and overwrite disabled; existing presets
  were not modified. Do not include credentials or signed URLs in evidence.
- Real image upload, provider inspection and public delivery returned 200. Verification
  exposed the SDK's nested 404 error shape; the adapter now recognizes both not-found shapes
  and continues to sanitize other provider failures.
- The repeated image proof passed upload, inspection, delivery and verified deletion.
  `npm run verify` passed lint, OpenAPI validation and **414 tests, zero failures/skips**.
  Final lint/OpenAPI checks and the 26 provider-contract tests also passed after the fixes.
  These results are local regression/provider proofs, not staging acceptance.

### Real local course and Checkout journey — 2026-10-04

- Created three new dedicated local demo accounts (seeded admin, verified instructor and
  verified student). Verification used local Mailpit; no external personal mailbox or
  existing account was altered. Instructor application and admin approval passed via HTTP.
- Created one new dedicated category and paid draft course, one section and one protected
  lesson. The actual upload-intent → direct Cloudinary upload → HTTP confirmation flow
  passed for both a cover and PDF, beyond the earlier adapter-only proofs.
- Uploaded Mux's public demo video through the backend-issued direct-upload URL. Verified
  the provider upload is Test Mode and signed-only. The real Mux webhook reached the API
  through the existing Mux-only tunnel and made the lesson ready; no synthetic ready state
  or generated webhook event was inserted. Review submission and admin publication passed.
- The verified student without enrollment was denied protected playback and PDF (403).
  Server-created Stripe Test Checkout succeeded. Before payment, no Enrollment or sale
  EarningEntry existed for this new order. Stripe subsequently confirmed the existing hosted
  Test Checkout was complete/paid; no replacement Checkout or second payment was created.
- Local execution sessions interrupted API/MongoDB/listener availability during payment.
  The original Stripe event did not reach the local inbox. Restored the dedicated local
  services and recovered exactly one original event using the existing bounded operations
  service and authenticated Stripe retrieval. No fabricated payload/signature, manual paid
  update or direct Enrollment/EarningEntry insertion was used. **Real Stripe HTTP webhook
  delivery through an uninterrupted listener remains unproven by this run.**
- The normal durable worker fulfilled the recovered event: Order paid, Payment succeeded,
  exactly one active Enrollment and one pending sale EarningEntry. Re-ingested the same
  authenticated event to verify idempotent receipt; no second payment was created.
- The enrolled student received playback/PDF credentials via the real protected API. Signed
  Mux playback and authenticated PDF download returned 200; unsigned Mux playback returned
  403. HTTP progress completion and last-lesson writes passed. The disposable student's
  session was recovered through the normal local Mailpit password-reset flow after interruption.
- A separate adapter proof on this same dedicated course used 60-second Mux/PDF credentials:
  both worked before expiry (200) and the **same** credentials were denied after expiry
  (Mux 403, PDF 401). Unsigned PDF delivery was 401. Application Mux TTL remains unchanged
  at 900 seconds: the shortened proof does not demonstrate the full default 15-minute expiry.
- The temporary loopback Checkout redirect closed after successful fulfillment. It was a
  diagnostic helper, not a product endpoint or staging deployment.
- The published course/media and financial attempt are retained for the payment test/audit.
  Mux Test assets expire automatically after 24 hours, so this is not long-course evidence.
  No existing data was deleted, no application readiness/money fields were patched directly,
  and no source changes were committed/pushed.

### Uninterrupted direct Stripe HTTP delivery proof — 2026-10-05

- Prepared one new server-created Test Checkout on the dedicated published demo course
  for a new verified local student. The earlier paid order was not reused or modified.
  API health was 200 and the Stripe CLI listener was ready before checkout creation.
- **PASS — local direct signed HTTP delivery.** After manual hosted Test payment, the
  listener forwarded one successful HTTP receipt at `/api/v1/webhooks/stripe` (200).
  The matching inbox event was processed; the new order became paid with exactly one
  succeeded Payment, one active Enrollment and one pending sale EarningEntry. The new
  student accessed the course library successfully. No recovery/replay operation, synthetic
  event or API restart was used during this proof. The course now has two paid orders for
  two different dedicated students (the earlier recovery proof and this direct proof), not
  duplicate fulfillment of the same order. This remains local, not staging acceptance.
- The loopback-only redirect `http://127.0.0.1:5110/checkout` is temporary and closes when
  the proof succeeds or its ten-minute wait deadline expires. It is not a product endpoint.

All cases A01–A19 in [staging acceptance](staging-acceptance.md) are **NOT RUN** on staging.
Replace each row only after actual execution; never treat missing evidence as PASS.

| Cases | Result | Sanitized evidence reference | Operator / UTC | Follow-up |
| --- | --- | --- | --- | --- |
| A01–A03 auth/content/review | NOT RUN | — | — | Staging deployment + demo mailboxes |
| A04–A09 Stripe delivery/failure/burst | NOT RUN | — | — | Server Checkout + real signed events |
| A10 free enrollment | NOT RUN | — | — | Dedicated free course/student |
| A11–A14 protected media/expiry/revocation | NOT RUN | — | — | Real private PDF + signed Mux assets |
| A15 progress/resume | NOT RUN | — | — | Published enrolled demo course |
| A16–A18 frontend/rate/shutdown | NOT RUN | — | — | Real ingress/frontend + fault window |
| A19 migrations/legacy | NOT RUN | — | — | Reviewed staging backup/data |

Expand grouped rows into one result per case when executing. For webhook bursts record
total events, unique events, concurrency, elapsed time, response codes, acknowledgment
latency, oldest backlog age and drain time; reconcile duplicates/financial counts privately.
For expiry record issue/expiry/fetch UTC times and HTTP outcome, **not the credential URL**.

## Decision

**NOT accepted for final Sprint 2 delivery yet.** Local regression and handoff preparation
do not prove the full staging journey. No production readiness or zero-defect claim.
The Sprint plan's Definition of Done remains unchecked pending verified evidence.
