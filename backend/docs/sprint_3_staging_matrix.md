# S3-16 local rehearsal and staging acceptance

The current execution scope is local. Backend baseline `9329fe7`, OpenAPI `1.11.0`.
Local HTTP smoke on 2026-11-21 at 20:09 UTC returned 200 for health, contract and public categories, and 401 with the expected error code for anonymous admin dashboard access. The backend integration rehearsal uses an isolated MongoDB replica-set database, a local in-memory verification mailbox, and a bootstrapped admin. Two distinct accounts register, verify and log in through HTTP. The student is denied admin review, the approved instructor creates a draft, premature submission fails readiness and the draft stays outside the public catalog. The instructor then confirms a cover through a provider double and requests a local video upload. A synthetic Mux event passes the real signature verifier. After admin approval the course appears in the catalog, the student enrolls for free and completes the lesson with 100% progress. The rehearsal uses HTTP for these transitions and writes no readiness or payment flags directly.

Local verification on this baseline passed lint, OpenAPI validation and 663 existing tests (zero failed, cancelled or skipped). The new three-role publication and learning rehearsal passed in a separate targeted run.

## Reproduce locally

From `backend`, run `npm run mongo:local`, `npm run verify`, and start the development API. To rerun the read-only smoke on PowerShell:

```powershell
$env:STAGING_API_URL = 'http://localhost:5000/api/v1'
npm run staging:smoke
```

The optional `STAGING_FRONTEND_URL` checks that the frontend serves HTML. Browser flows require their own evidence. The frontend checkout at this baseline defines a home route only.

## Evidence register

Use the [A-series procedures](staging-acceptance.md) and [B-series acceptance criteria](sprint_3_backend_plan.md). Local coverage describes which parts can be exercised independently. For each deployed case record the UTC window, build, operator, expected versus observed result and a sanitized evidence reference before updating its result.

| Case | Scenario | Local coverage or dependency | Staging result |
| --- | --- | --- | --- |
| A01 | Trusted-origin browser session and expiry | Auth/session HTTP tests | NOT RUN |
| A02 | Provider upload, callback and publication | Course review, video and media suites | NOT RUN |
| A03 | Application rejection, resubmission and public links | Instructor application and profile suites | NOT RUN |
| A04 | Hosted test purchase and enrollment | Checkout and payment fulfillment with test doubles | NOT RUN |
| A05 | Decline and abandoned checkout | Checkout and order tests | NOT RUN |
| A06 | Repeat delivery of the original receipt | Payment fulfillment and refund finalization suites | NOT RUN |
| A07 | Restart during payment fulfillment | Payment worker recovery tests | NOT RUN |
| A08 | Invalid signatures, size limit and persistence failure | Webhook contract and persistence tests | NOT RUN |
| A09 | Agreed ingress burst and backlog drain | Ingress burst measurement pending | NOT RUN |
| A10 | Concurrent free enrollment | Enrollment integration tests | NOT RUN |
| A11 | Preview versus protected media | Learning access tests | NOT RUN |
| A12 | Owner, admin and enrolled credentials | Learning access and course administration suites | NOT RUN |
| A13 | Fetch the same URL before and after expiry | Credential bounds tested; actual CDN expiry pending | NOT RUN |
| A14 | Access revocation and provider deletion | Video and learning access suites | NOT RUN |
| A15 | Progress and resume | Progress integration tests | NOT RUN |
| A16 | Frontend polling, backoff and timeout | Team checkout UI pending | NOT RUN |
| A17 | Ingress quotas and rate-store outage | Auth and staging operations tests; actual ingress pending | NOT RUN |
| A18 | Bounded shutdown and recovery | Worker shutdown and lease regression tests | NOT RUN |
| A19 | Legacy migrations and restart | Migration and legacy-content suites | NOT RUN |
| B01 | Suspension and last-admin guard | Admin users integration | NOT RUN |
| B02 | Archive and existing buyer access | Course administration integration | NOT RUN |
| B03 | Refund request replay | Refund reservation integration | NOT RUN |
| B04 | Genuine full refund and ledger | Refund finalization with test doubles | NOT RUN |
| B05 | Unknown or failed refund recovery | Refund recovery tests | NOT RUN |
| B06 | Receipt redelivery and crash recovery | Payment fulfillment and refund finalization | NOT RUN |
| B07 | Eligibility window and calendar boundaries | Earnings integration | NOT RUN |
| B08 | Payout netting and debt | Earnings and settlement suites | NOT RUN |
| B09 | Concurrent payout reservation | Payout reservation concurrency tests | NOT RUN |
| B10 | Refund during settlement | Refund and payout integration | NOT RUN |
| B11 | Unknown external transfer | Simulated settlement and reconciliation | NOT RUN |
| B12 | Repurchase after refund | Repurchase integration | NOT RUN |
| B13 | Role-scoped financial reporting | Admin/instructor finance regression suites | NOT RUN |
| B14 | Published revision review | Transactional revision approval and rollback tests | NOT RUN |
| B15 | Revision media and learning progress | Course administration and progress tests | NOT RUN |
| B16 | Outage, shutdown and alerts | Outage and bounded shutdown tests; alert delivery pending | NOT RUN |
| B17 | Restore and external reconciliation | Local mongodump/restore evidence in S3-15 | NOT RUN |
| B18 | Three-role responsive frontend | Three-role backend rehearsal; team role screens pending | NOT RUN |
| B19 | Public profile and course detail | Catalog and instructor profile regression tests | NOT RUN |
| B20 | Security, privacy and dependency review | Auth and validation suites; release scans pending | NOT RUN |
| B21 | Product closure and sign-off | Traceability and product acceptance pending | NOT RUN |
