# MVP demo and frontend acceptance

Use the [frontend handoff](frontend-handoff.md) for request examples and the
[OpenAPI contract](openapi.yaml) for required fields, headers and response schemas.
All paths below are relative to `/api/v1`.

## Rehearse the core journey locally

From `backend`, start the local MongoDB replica set with `npm run mongo:local`.
Run the following against the isolated test database:

```sh
node --import ./tests/setup-env.js --test tests/three-role-rehearsal.integration.test.js
```

The rehearsal creates its own accounts and exercises verification, instructor
approval, draft readiness, publication, free enrollment and lesson completion over
HTTP. It uses provider doubles. For a manual walkthrough use distinct student,
instructor and admin browser profiles so refresh cookies stay with their owners.

| Step | Operator and action | Observable result |
| --- | --- | --- |
| 1 | Instructor registers, verifies, logs in and submits an instructor application. Student tries to read the admin review queue. | Application awaits review. Student sees the forbidden state. |
| 2 | Admin reviews the application. Approved instructor creates a draft and submits it before adding content. | Submission identifies missing requirements. A student searching the catalog cannot see the draft. |
| 3 | Instructor adds cover, section and lesson, uploads video, waits for readiness and submits again. Admin inspects and approves. | Course appears in the public catalog. Open its slug as the student. |
| 4 | Student enrolls in the free course, opens it from My Courses, starts playback and marks each lesson complete. | Library shows the enrollment, resume opens the saved lesson and completion reaches 100%. |
| 5 | Instructor opens an editable revision and submits a material change. Admin rejects with a reason, then reviews a corrected submission. | Student sees the prior published content during review. Refresh detail and curriculum after approval to see the change. |

## Demonstrate the alternate outcomes

Use separate disposable courses and orders for these cases. Record the observed
state from a fresh GET after each mutation.

| Scenario | Procedure and pass condition |
| --- | --- |
| Paid purchase and decline | Use a published paid course and Stripe Test checkout. A declined attempt grants no entitlement. After successful payment, read the student's order and library until fulfillment is visible. The browser redirect alone cannot confirm enrollment. |
| Refund and repurchase | With test issuance enabled and an eligible order, admin submits a full refund with an idempotency key. Show pending after acceptance, then revoked access after confirmed success. On a successful repurchase, verify current access and recomputed progress. See [repurchase rules](sprint_3_repurchase.md). |
| Archive and access block | Archive a course with an existing enrollment. Check that it leaves the catalog and its learner retains access. Apply the admin access block on that fixture and verify protected content is unavailable. See [course access policy](sprint_3_course_access.md). |
| Payout and uncertain outcome | Preview an instructor with eligible earnings, create a draft and submit a simulated attempt. Reconcile an unknown outcome and verify it remains pending. Record confirmed payment only with matching attempt, amount and reference. Compare admin detail with instructor history. See [settlement commands](sprint_3_payout_lifecycle.md). |

## Delivery checklist

On 2026-11-21 the local verification run passed lint, OpenAPI validation and
664 tests with zero skips. The new route inventory test also passed separately
against all 112 operations on 99 paths, and lint passed again with that test included.

| Owner | Evidence to collect | Status |
| --- | --- | --- |
| BE1 | Run `npm run verify` for the candidate. The route inventory test compares mounted product methods and paths with OpenAPI. Record build and result. | Local verification only |
| BE1 + deployment operator | Identify deployed API and frontend builds, run the read-only smoke, rehearse provider callbacks and recovery, attach sanitized evidence per case. | Awaiting staging. [Evidence matrix](sprint_3_staging_matrix.md) |
| FE1 / FE2 / FE3 | Walk the student / instructor / admin sections respectively on desktop and mobile. Record build, browser, observable result and any defect with owner. | Awaiting role sign-offs |
| FE team + BE1 | Record the integrated demo, including an alternate outcome. Remove tokens, personal data, signed URLs and provider credentials before sharing. | Awaiting integrated build |
| Product representative + team | Review unresolved policy, retention, operations and credential decisions with their named owners. Accept the tested scope after reviewing evidence. | Open. [Decision register](sprint_3_policy_register.md) and [delivery criteria](sprint_3_backend_plan.md) |
