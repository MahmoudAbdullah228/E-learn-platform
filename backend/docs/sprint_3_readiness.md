# S3-01 — Baseline, gap register and readiness evidence

Date: 2026-11-18. Branch: `feature/sprint-3-mvp-closure`.
Source baseline: `64f742a7b319f4d1f3be8f5ff9837ee6c9ab4687` (merged PR #7 + frontend setup).
S3-01 changes are documentation only; runtime source, dependencies, environment and public
OpenAPI are unchanged. Prior uncommitted plan/checklist changes were preserved.

This is the historical S3-01 snapshot. Follow-up S3-02 implemented the internal models,
indexes, audit/finance guards and read-only legacy diagnostic; see
[S3-02 verification](sprint_3_financial_foundation.md). G03 now has additive nullable schema,
G04/G06 have model foundations, and G05 has policy/guard models. Provider reducers,
activation, eligibility and refund/payout HTTP workflows remain open in their owning
Stories. The snapshot below is not a claim that those models are still absent today.

S3-03 follow-up: admin user directory/status workflow, audit and session fencing are now
implemented locally; G09 implementation is covered by [S3-03 evidence](sprint_3_admin_users.md).
Its Staging B01/qualified-review acceptance remains open. S3-04 archive/access policy now
covers the G10 implementation gap; [S3-04 evidence](sprint_3_course_access.md). Its B02
Staging/qualified review remains open. S3-05 adds guarded reservation/read/provider contracts
for G04 with [separate evidence](sprint_3_refund_requests.md). Its application issuance gate
remains disabled by default. S3-06 now covers the G03 new-purchase confirmation/policy
integration and G04 atomic finalization/recovery implementation; see
[S3-06 evidence](sprint_3_refund_finalization.md). Legacy mapping, explicit policy activation,
S3-08 eligibility, Staging and qualified financial review remain separate gates.
Next Story is S3-07; the gap table below preserves the historical baseline.

## 1. New automated baseline — PASS

| Check | Observed result |
| --- | --- |
| Node / npm | v22.20.0 / 10.9.3 |
| Database preflight | `e_learning_platform_test`, replica set `elearnLocal`, writable primary; different from configured app DB |
| `npm run verify` | exit 0; lint + OpenAPI validation + tests passed |
| Test result | **432 passed, 0 failed, 0 skipped, 0 cancelled** |
| Test runner duration | 295.55 seconds; measured on this machine, not an API SLO or comparison of application performance |
| Providers | Fake/injected in automated tests; no real refund/transfer/upload/deletion |
| Protected inputs | No `.env` read into output, no URI/credentials/token printed |
| GitHub | No commit/push/PR/merge in S3-01; last pull/branch setup precedes this Story |

The sandboxed DB probe could not reach localhost. `npm run mongo:local` started the
dedicated local replica set; authorized loopback preflight and the full verification then
passed. Integration tests clean only their isolated `_test` fixtures. No development DB
cleanup, live seed/migration or provider-account action was performed.

The baseline verifies the existing code, **not** models/refunds/payouts described in new
documents. No feature count increased and no Staging case changed to PASS by this run.

## 2. S3-01 artifact / layer inventory

- [Policy register](sprint_3_policy_register.md): explicit delegated product choices,
  policy activation/time semantics, accepted vs operationally open decisions.
- [ADR 0006](adr-0006-financial-integrity-and-settlements.md): ledger/holds/refund/payout
  schema/index design, safe provider boundary, state transitions and tests.
- [ADR 0007](adr-0007-published-course-revisions.md): isolated candidate model, live diff
  promotion, content/media/progress associations and large-case readiness gate.
- [Contract draft](sprint_3_contracts.md): S3-02 internal model/validation/service boundary,
  and the first admin/archive/refund HTTP drafts for their later owning Stories.
- This file: verified baseline, code-evidenced gaps, carry-in evidence owners and Ready gates.

No Mongoose collection, Zod runtime schema, controller/route or worker is created in S3-01.
Their necessary design is documented, not mixed into bootstrap or served Swagger before
implementation. Models/guards are the next Story; HTTP work follows its own Story.

## 3. Gap register — findings, not duplicate implementation tasks

Owner roles below are assignments for coordination, not a claim that named team members
have already reviewed or signed off. BE1 owns backend changes; FE3 reviews API integration,
and sensitive-money/security review must have a qualified reviewer before commercial use.

| ID | Source / observed code evidence | Type / impact | Story / owner / reviewer | Acceptance and estimate treatment |
| --- | --- | --- | --- | --- |
| G01 | STU03: `users.service.js` and `avatarImage.service.js` now resolve owned ready avatarUrl | Implemented locally; don't rebuild | Residual S3-18; BE1 + FE1 | Existing avatar/ownership/delete tests pass; B19 real UI evidence pending; no duplicate feature estimate |
| G02 | MVP details: `catalog.service.js` + `curriculumSummary.js` give counts and safe nullable duration from one snapshot | Implemented locally; don't rebuild | Residual S3-18; BE1 + FE1 | Counts/duration/snapshot/overflow tests pass; B19 pending; keep unknown-duration UI fallback |
| G03 | P02/P06: `paymentFulfillment.service.js` uses `paidAt: now`; Stripe adapter has no trusted paymentConfirmedAt | Required financial integration gap, not a failing current test | Schema S3-02; reducer/adapter S3-06; eligibility S3-08; BE1, FE3/qualified review | Normalize authenticated success event time, validate units/associations, delayed/duplicate events do not move deadlines; included in owning Story estimates |
| G04 | MVP refund flow: no Refund model/module; current `payment.schemas.js` recognizes Checkout events only | Planned core feature | S3-02/05/06/07; BE1, FE1/FE3 | Full success/failure/unknown, partial/dispute safety hold, rollback, replay, repurchase; B03–B06/B10/B12 |
| G05 | `EarningEntry` sale remains pending with eligibleAt null; no eligibility job/policy row/finance guard | Planned core feature | S3-02/08; BE1, FE2/FE3 | Versioned policy, holds, exact boundary/legacy mapping/concurrent guard; B07/B08 |
| G06 | No Payout/PayoutItem/reservation/transfer-resolution workflow | Planned core feature | S3-02/09/10; BE1, FE3 | One active net claim, all carry debt, sealed immutable total, unknown transfer recovery; B09–B11 |
| G07 | INS09/10 and ADM08/10: no finance summaries/dashboard modules | Planned core feature | S3-11/12; BE1, FE2/FE3 | Owner isolation, exact sums/definition/asOf, no join duplication; B13 |
| G08 | ADM07: `order.presenter.js` payment DTO omits gateway references even for admin | Confirmed contract gap | S3-12; BE1 + FE3 | Admin-only safe transaction IDs; student/public DTOs unchanged; B13 |
| G09 | ADM03: User.status/Auth already exist, no admin users/status workflow/last-admin guard | Planned core feature | S3-03; BE1 + FE3 | Atomic suspension/session invalidation, concurrent last-admin protection; B01 |
| G10 | BR09: Course enum lacks archived; library/progress/access selectors require published | Cross-module feature gap | S3-04; BE1 + FE1/FE2/FE3 | Update all read/issue/write selectors consistently; archived paid access and blocked content differentiated; B02 |
| G11 | Post-publish rule: published edits rejected; no candidate models/review context | Planned core feature | S3-13/14; BE1 + FE2/FE3 | Stable IDs, live availability, fresh candidate/media validation, bounded atomic diff, unchanged old price; B14/B15 |
| G12 | Cleanup PR finding: shared scheduler/cleanupNotBefore and ten regressions already merged (`ad503de`) | Fixed locally; don't repeat patch | S3-14 reuse + S3-19 regression; BE1 | Existing 432 baseline includes cleanup cases; do not remove settlement delay in revision cleanup |
| G13 | `frontend/src/routes/AppRoutes.tsx` contains Home placeholder only in this checkout | Integration coverage not established, not a backend feature pass | S3-16/20 + per-Story handoff; FE1/FE2/FE3/UX1 | Actual team build/origins, three-role flows and responsive states; estimate FE work separately |
| G14 | `staging-evidence.md`: A01–A19 NOT RUN, backend/frontend deployment identity missing | Acceptance gap | S3-16/20; BE1 + FE3, product reviewer | Execute matrix below and B01–B21 on real Staging, sanitized evidence; no localhost substitute |
| G15 | No final measured restore/rollback/SLO/alert/retention evidence for Sprint 3 | Operational readiness gap | S3-15/19/20; BE1 + deployment operator | O03/O04/O06 closed by measurement and rehearsal, not a guessed target |

These findings are a readiness pass, not a claim of exhaustive code-security audit. New
findings get source/evidence/severity/owner/test/estimate inside Sprint 3. Known feature gaps
are not described as bugs in the already implemented Sprint 2 behavior. Each owner updates
their row with test/evidence references on closure; no silent deferred core feature.

## 4. A01–A19 carry-in — all NOT RUN on Staging

Detailed procedure remains [the Staging runbook](staging-acceptance.md); this table adds
coordination ownership and a sequencing deadline, not invented dates or results.

| Case | Test area | Executor roles | Required before |
| --- | --- | --- | --- |
| A01 | Browser auth/origin/session lifecycle | BE1 + FE1/FE3 | S3-16 acceptance |
| A02 | Real upload/webhook/review/publish | BE1 + FE2/FE3 | S3-16 acceptance |
| A03 | Rejection/reopen/profile links | BE1 + FE2/FE3 | S3-16 acceptance |
| A04 | Genuine server-created Stripe Test payment | BE1 + FE1 | Payout enablement proof and S3-16 |
| A05 | Decline/close/ambiguous Checkout | BE1 + FE1 | S3-16 acceptance |
| A06 | Signed event replay/concurrent duplicate | BE1 + FE3 | Payout enablement proof and S3-16 |
| A07 | Durable inbox restart/deferred processing | BE1 | S3-16 acceptance |
| A08 | Signatures/body size/DB outage errors | BE1 | S3-16 acceptance |
| A09 | Controlled webhook burst/backlog drain | BE1 + deployment operator | Agreed load-budget proof, S3-16 |
| A10 | Repeated/concurrent free enrollment | BE1 + FE1 | S3-16 acceptance |
| A11 | Un-enrolled preview/video/PDF denial | BE1 + FE1 | S3-16 acceptance |
| A12 | Enrolled/owner/admin/foreign media access | BE1 + FE1/FE2/FE3 | S3-16 acceptance |
| A13 | Unsigned and actual expired credentials | BE1 + FE1 | S3-16 acceptance |
| A14 | Entitlement/session/provider deletion | BE1 + FE1 | S3-16 acceptance |
| A15 | Completion/uncomplete/concurrency/resume | BE1 + FE1 | S3-16 acceptance |
| A16 | Frontend order polling/backoff | FE1 + BE1 | S3-16 acceptance |
| A17 | Deployment rate-store/proxy/origin behavior | BE1 + FE3/operator | S3-16 acceptance |
| A18 | Shutdown/provider/transaction recovery | BE1 | S3-16 acceptance |
| A19 | Migration/legacy compatibility | BE1 + FE2/FE3 | S3-16 acceptance |

No expiry proof by minting a replacement credential. No manual paid/readiness patch, no
seed into a database before confirming its identity, and no secrets/credential URLs in Git
evidence. O01 fixes actual origins/build IDs before executing these cases; the role table
does not authorize modifying the providers, creating accounts or deployment today.

## 5. Readiness decisions / Definition of Done

- Local baseline: **PASS**, fresh on the source revision above.
- Product choices P01–P18: **accepted design** with explicit user-delegation provenance;
  operational O01–O07 remain open with owners/gates, not marked accepted.
- Schema/index/transaction design: documented in ADR 0006, not installed in the database.
- Candidate design: documented in ADR 0007; promotion budget/retention must be measured
  before their owning features, not set to arbitrary course-wide limits.
- Proposed contracts: available for foundation and initial admin/archive/refund work;
  no additional public endpoint appears in OpenAPI.
- Remaining estimate: original 101–149 BE1 hours is a forecast requiring calibration;
  already implemented G01/G02/G12 are not recharged. Waiting time, FE and capacity remain
  visible in O01/O05; no credible replacement date is invented without team availability.
- FE3 contract/qualified security review: **not yet evidenced**. This document is ready for
  that review, not a forged reviewer sign-off. It does not prevent S3-02 isolated foundation
  work, but the relevant integration/release gates cannot be closed without evidence.

**S3-01 local preparation is complete; it is not full Staging/product acceptance.** Next:
S3-02 internal financial foundation was the next step at capture and is now implemented
locally, followed by S3-03/04 and guarded S3-05 contracts; next step is S3-06. S3-18 requires
only its remaining gap/evidence work, not rebuilding profile/catalog changes already done.
