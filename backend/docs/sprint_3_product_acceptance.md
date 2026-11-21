# S3-20 · MVP acceptance record

**Decision on 2026-11-21: pending integrated staging acceptance.** The local working tree includes changes after `9329fe7`. That commit alone does not identify the tested build. The last recorded backend verification passed 668 tests; the frontend in this checkout defines only the home route. The integrated frontend build, deployed backend revision, staging origins and product sign-off are outstanding.

## Acceptance register

Each row is pending. The case IDs refer to the [staging evidence matrix](sprint_3_staging_matrix.md). At execution, record the deployed builds, UTC time, reviewer, observed result, sanitized evidence link and decision for **each** criterion. Record an issue and retest reference for any failure. The product representative owns the final decision.

| Criterion | Observation required on the candidate | Cases | Evidence owner |
| --- | --- | --- | --- |
| AC01 | Student registers, verifies, signs in, recovers access and refreshes the browser session. | A01, B20 | FE1 + BE1 |
| AC02 | Applicant sees a rejection reason, resubmits and gains instructor access after approval. | A03 | FE2 + FE3 |
| AC03 | Instructor uploads course media, completes the curriculum and submits a reviewable course. | A02 | FE2 + BE1 |
| AC04 | Anonymous catalog hides drafts; approved publication exposes the reviewed content. A pending revision leaves the current publication visible. | A02, B14 | FE1 + FE3 |
| AC05 | Stripe Test checkout charges the agreed price and currency, including when the course price later changes. | A04, A05, B14 | FE1 + BE1 |
| AC06 | Successful signed payment fulfillment creates the paid enrollment. A declined checkout grants no access; free enrollment creates no paid order. | A04, A05, A10 | BE1 |
| AC07 | Redelivery and worker restart preserve exactly one enrollment and sale entry for the successful purchase. | A06, A07, B06 | BE1 |
| AC08 | Enrolled student opens My Courses, plays a lesson and sees saved completion and resume position after signing in again. | A11, A15, B15 | FE1 + BE1 |
| AC09 | Anonymous and unenrolled users cannot open the protected lesson or PDF; preview and credential expiry behave as documented. | A11–A14 | FE1 + BE1 |
| AC10 | Instructor sees only their own earnings; the platform commission and instructor share reconcile to the paid order snapshot. | B07, B08, B13 | FE2 + FE3 |
| AC11 | Admin records the simulated transfer once. Retrying leaves the settled amount and remaining balance correct. | B09–B11, B13 | FE3 + BE1 |
| AC12 | Complete the three role journeys on the agreed desktop and mobile browsers, recording versions and layout results. | B18 | FE1/2/3 + UX1 |
| AC13 | Demonstrate loading, empty, error, retry and unknown payment/transfer states on the role screens. | A16, B05, B11, B18 | FE1/2/3 + UX1 |
| AC14 | Inspect the release frontend bundle, network traffic, cache and logs for credentials and sensitive payment data. | B20 | FE3 + BE1 |

## Delivery and outstanding work

| Owner | Available locally | Evidence required to close |
| --- | --- | --- |
| BE1 + deployment operator | [Verification and security findings](sprint_3_hardening.md), [financial operations and restore runbook](sprint_3_financial_operations.md) | Pin the candidate including local changes, rehearse clean setup, record ingress, operational thresholds, alerts, backup/restore timing and external reconciliation. |
| BE1 + FE leads | [OpenAPI](openapi.yaml), [frontend handoff](frontend-handoff.md), [three-role demo](sprint_3_demo.md) | Supply integrated backend/frontend build IDs and origins, isolated demo accounts and fixtures. Exercise provider sandbox flows and each role screen. Attach role guides, dated role approvals and a sanitized backup recording. |
| Product + UX1 + FE1 | [Backend policy decisions](sprint_3_policy_register.md) | Review and approve the visible privacy, terms and refund content against the implemented policy. Credential owner resolves O07 before using staging credentials. |
| Product representative | [Sprint plan §17](sprint_3_backend_plan.md) maps 32 functional requirements, 10 business rules, 14 acceptance criteria and 10 nonfunctional requirements. | Review the mapped evidence and open defects, complete A01–A19 and B01–B20, then record the dated decision in B21. |

The next dependency is an integrated staging candidate from BE1 and the frontend leads. Record the same build pair throughout the register and identify any changed build on retest.
