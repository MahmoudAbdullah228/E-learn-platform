# S2-12 — Staging acceptance and delivery runbook

Status: **local handoff preparation implemented; real staging acceptance NOT RUN**.
The full Sprint 2 Definition of Done remains open until the evidence below is collected.
Passing mocked-provider tests or `providers:proof:live` alone does not close this gate.
No new product endpoint, schema migration, or financial repair is introduced by S2-12.

## 1. Freeze and prerequisites

Record the exact source revision **and dirty-worktree status**, Node version, UTC time,
backend/frontend origins, operator, and environment name in the evidence file. A commit
identifier alone does not identify uncommitted code. Do not test an unidentified deployment.

- Dedicated staging replica-set MongoDB and provider projects/accounts; never production data.
- HTTPS API/frontend on the same site for SameSite=Lax refresh cookies. Configure exact
  `CORS_ORIGINS`, Mux upload origin, reset/verification URLs and Stripe return URLs.
- Correct `TRUST_PROXY_HOPS`; single API instance with the current memory limiter. More than
  one API instance requires an implemented/tested shared adapter for every limiter namespace.
- Independent deployed JWT/refresh secrets, SMTP delivery, Cloudinary restricted signed
  presets, Mux API/signing/webhook keys, **Stripe Test Mode** credentials and destination.
  Refer to `.env.example` and the provider ADR; never paste actual values into evidence.
- Provider webhooks must reach the deployed API. Stripe uses `/api/v1/webhooks/stripe`;
  Mux uses `/api/v1/webhooks/video`. Preserve raw bytes and the provider signature header.
- Agree an external asset budget, cleanup owner and test window before any real uploads.
  Mux test assets have short-lived proof limitations; do not claim long-course coverage.
- Back up the staging database and record a restoration drill. Restrict operator CLI access.

Run locally from `backend` (test setup selects the isolated `_test` database):

```powershell
npm ci
npm run verify
git -c core.autocrlf=false diff --check
```

Run migrations against the **intended staging environment**, with backups, before acceptance:

```powershell
npm run migrate:sprint2-content
npm run migrate:signed-playback
```

Review the dry-run outputs before using their documented apply modes. For signed playback,
use bounded pages and recorded cursors; rerun partial pages safely. Do not delete duplicate
financial history to make a migration pass. If duplicates block unique indexes, stop and
resolve them through an audited repair plan. Never disable an index merely to start the API.

## 2. Demo data through real APIs

Use `seed:admin` with explicit private credentials and `seed:categories` for baseline data.
Seeds target the configured application database, **not automatically the test database**.
Do not run them until its identity is confirmed. Create all other demo records through the API:

1. Register and verify four different controlled mailboxes: instructor applicant, paid
   student, free student, and un-enrolled student. Keep passwords/tokens outside this repo.
2. Submit the instructor application including an HTTPS link. The seeded admin approves it.
   Confirm the public profile includes the reviewed link, then update/clear it and verify
   the historical application remains unchanged.
3. Instructor creates paid and free drafts in an active category: complete descriptions,
   short description, level, language, requirements, outcomes; paid price in integer EGP
   minor units that Stripe accepts. Use unique demo titles/slugs, record database IDs privately.
4. Each course gets a nonempty section and two lessons: one preview and one protected.
   Upload actual short videos using the browser's returned direct Mux URL. Wait for **real
   signed webhook processing** until every video is ready. Upload/confirm a real cover and
   a harmless one-page PDF on the protected lesson through Cloudinary intents.
5. Submit review; admin rejects one draft with a reason. Reopen, repair, resubmit, approve.
   Approve the other complete draft. Confirm catalog visibility and safe public DTOs.

Do not insert synthetic ready videos, fake provider IDs, paid orders, earnings or enrollments
into staging to pass acceptance. Keep personal data minimal and use disposable demo content.
Record the IDs of newly created external resources in a private cleanup inventory.

## 3. Acceptance matrix

For every row record result (`PASS`, `FAIL`, `BLOCKED`, `NOT RUN`), sanitized evidence,
operator and UTC time in [the evidence template](staging-evidence.md). Screenshots/HARs can
contain cookies, bearer tokens and signed URLs: redact before sharing. Do not commit raw HARs.

| ID | Exercise | Required outcome |
| --- | --- | --- |
| A01 | Browser login, refresh, logout; wrong origin; expired bearer | Credentials work only under trusted origin/session policy; no cookie/token in logs; expired access cannot bypass auth |
| A02 | Demo upload → real webhook → review → publish | Ready trusted media, correct review state, published catalog details; pending/published instructor edits return 409 with no partial changes |
| A03 | Instructor rejection/reopen and profile links | Reason shown, explicit reopen before edits; links flow through approval/profile, safe public fields only |
| A04 | Paid student starts **server-created** Stripe Test Checkout and completes a successful test payment | Redirect alone grants nothing; processed real event results in paid Order/Payment, exactly one active Enrollment and one pending sale EarningEntry with recorded split |
| A05 | Declined test payment, close Checkout, then query order | No false success/enrollment; closing a tab does not imply cancellation; unresolved attempt retains slot until trusted terminal evidence |
| A06 | Resend the original valid Stripe event and deliver concurrent duplicates | Inbox unique event, one Enrollment/sale per order; no extra payment or regressed paid state |
| A07 | Stop/restart worker during delivery; deliberately defer processing | Durable receipt, observable backlog; eventual correct fulfillment after restart/replay; no partially committed financial writes |
| A08 | Invalid Stripe/Mux signature; webhook body >1 MiB; controlled database outage | Invalid signature 400, oversized body 413; required persistence failure non-2xx; no raw provider/DB error in response |
| A09 | Controlled signed webhook burst with agreed count/concurrency | Record request rate, latencies, HTTP codes, inbox count and drain time; user/auth/catalog quota does not limit provider ingress; no lost required events |
| A10 | Free student enrolls in free course, repeats and races requests | Single active Enrollment, no Order/Payment/EarningEntry; paid/own-course/revoked cases rejected by policy |
| A11 | Un-enrolled/anonymous preview, protected video and PDF | Published preview video only; protected video and **all PDFs** denied without entitlement; invalid supplied JWT never falls back to anonymous |
| A12 | Enrolled playback/PDF; owner/admin review; foreign PDF ID | Authorized signed-only playback; authenticated PDF scoped to lesson; foreign attachment denied; no public Mux policy remains |
| A13 | Fetch media unsigned and after actual credential expiry | Unsigned protected content denied, authorized credentials work before expiry and fail after; test the same issued credential, not a newly minted URL |
| A14 | Revoke entitlement/session; provider deletes published video | New credentials denied immediately; already issued ones only until expiry. Course becomes unavailable and cannot be resurrected by late ready event |
| A15 | Complete/uncomplete/repeat/concurrent progress and set last lesson | Canonical percentage/completedAt, no duplicates; resume does not imply completion; protected write requires enrolled published course |
| A16 | Poll orders with frontend | 5-second start, backoff up to 30 seconds, automatic stop after 2 minutes/manual refresh; 429 honors Retry-After; no new checkout on timeout |
| A17 | Default rate thresholds and controlled store failure | User quota spans resource IDs, separate namespaces preserved; safe 429/503; browser origin and proxy/IP behavior correct under actual ingress |
| A18 | Shutdown during provider/transaction work; restart | Bounded shutdown, no late unauthorized issuance or partial money writes; leases recover, pending queue drains |
| A19 | Migration dry run, partial page, rerun; legacy links/media | Resumable reports and signed-only readiness; preserve historical financial records; old links remain compatible |

Burst/outage/revocation tests affect state: use disposable staging resources and an agreed
maintenance window. The Mongo/SDK regression suite covers injected failures; actual staging
fault injection must be recorded separately, not inferred from those tests.

## 4. Operations and recovery

```powershell
npm run staging:status
npm run staging:status -- --execute
```

Default is dry run: no database connection. `--execute` reads only aggregate counts from
the configured database, with per-query 5-second limits. Use a MongoDB read-only account;
the CLI does not create collections/indexes, mutate records, start workers or call providers.
It emits no IDs, URIs, customer details, token/payload data or raw errors. Failed queries
exit nonzero without presenting a partial successful snapshot. This is an operator tool,
not a public HTTP endpoint or a readiness/liveness check.

`oldestAgeSeconds` is age since creation, **not time until retry or lease age**. Missing
historical timestamps return null, not zero. Pending/processing payments may be legitimate
unfinished Checkouts. `queued` cleanup includes scheduled/in-flight jobs; `due` means their
availability time has arrived (not necessarily an expired lease). Snapshots are separate
reads, not an atomic financial audit. Large queues can time out; investigate safely rather
than removing limits or assuming a zero backlog. Establish staging alert thresholds from
observed drain behavior and monitor them externally; this command alone is not monitoring.

Alert on any failed inbox/exhausted cleanup, growing pending/processing event counts, or
oldest age beyond the agreed recovery SLA. Store only aggregate snapshots in evidence.
For a failed payment event, diagnose/fix its cause, then use the bounded explicit replay in
[payment operations](payment-operations.md). Never mark an order paid manually or delete
financial records. Cleanup exhaustion needs private resource inspection and an audited
repair; no general-purpose reset/delete CLI is shipped.

The guarded `npm run providers:proof:live -- --execute` changes external state and exercises
provider adapter contracts only. It does not prove browser upload, actual payment/webhook
fulfillment, full playback expiry, frontend integration or long-course video support.
Read the provider ADR and use dedicated proof resources before explicitly executing it.

## 5. Rollback, cleanup and handoff

- On an unsafe release, pause **new** checkout/upload issuance at the deployment edge.
  Keep signed payment webhook ingestion and compatible fulfillment workers available for
  existing orders. Do not return fake successful acknowledgments while persistence is down.
- Restore only a compatible application version. Do not downgrade models/indexes blindly,
  purge the inbox, lose captured payments, or restore stale DB snapshots over financial data.
  Reconcile trusted provider evidence through the documented recovery path.
- Detach disposable lesson/media resources through their normal APIs while editable; respect
  delayed cleanup and provider deadlines. Preserve order/payment/inbox/earnings history.
  Remove only dedicated proof resources after owner approval; retain a private cleanup log.
- Deliver exact deployment origins, sanitized evidence, migration cursors/results, aggregate
  operating baselines, rollback owner, demo account access via a private channel and
  [frontend handoff](frontend-handoff.md) plus `openapi.yaml`/served JSON/Swagger URL.
- Refunds, disputes, Payout settlement, production/live Stripe, and instructor editing after
  publication/versioning remain **Sprint 3 or later**, not completed Sprint 2 features.

## Permission summary

| Capability | Visitor | Verified active student | Approved active owner | Admin |
| --- | --- | --- | --- | --- |
| Published catalog/preview video | Yes | Yes | Yes | Yes |
| Published protected learning/PDF | No | Active enrollment | Own course review | Review |
| Progress/resume write | No | Active enrollment + published course | Requires student enrollment too | No admin exemption |
| Draft curriculum/media writes | No | No | Own draft only | No owner exemption |
| Course approval/category management | No | No | No | Yes |
| Order read | No | Own orders | Own purchases only | All orders |

Full constraints and DTOs remain authoritative in the OpenAPI contract and feature docs;
this summary does not grant a bypass of account, session, ownership or resource checks.
