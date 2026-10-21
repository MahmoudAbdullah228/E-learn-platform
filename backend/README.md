# E-Learning Marketplace API

Stories 1.1 through 2.4 provide the production-oriented foundation, authentication, basic profiles, instructor application review, draft courses, ordered curricula, and Mux direct-video uploads. Sprint 2 through S2-11 adds media, categories, review/publication, catalog, Stripe Test checkout/fulfillment, free enrollment, the student library, student/admin order reads, signed Mux playback, private PDF downloads, lesson completion and resume position with dynamic progress. S2-12 real Stripe/Mux/Cloudinary staging acceptance is still required before release.

## Requirements

- Node.js 22.13.0 or newer (`.nvmrc` pins Node.js 22.20.0 LTS)
- MongoDB replica set or Atlas deployment available locally or through a connection string
- A dedicated MongoDB database for tests whose name ends in `_test`
- An SMTP server or local SMTP catcher for development
- A Mux Video environment and API/webhook credentials for video uploads

## Local setup

```powershell
cd O:\E-learning-platform\backend
npm install
Copy-Item .env.example .env
npm run mongo:local
npm run seed:categories
npm run dev
```

The server validates its environment before connecting to MongoDB. It stops with a concise configuration error when a required value is missing or invalid.

Before starting, replace both authentication secret placeholders in `.env` with independent random values. The local Swagger origin (`http://localhost:5000`) and frontend origin must both be listed in `CORS_ORIGINS` when using interactive session endpoints.

The health endpoint is:

```text
GET http://localhost:5000/api/v1/health
```

Example response:

```json
{
  "data": {
    "status": "ok",
    "uptimeSeconds": 10
  }
}
```

Story 1.2 adds:

```text
POST /api/v1/auth/register
POST /api/v1/auth/verify-email
POST /api/v1/auth/resend-verification
```

Registration always creates a `student`. Verification links expire after 24 hours and can be consumed only once. Resend uses the same generic response for existing, verified, and unknown accounts.

Story 1.3 adds:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
```

Access tokens are signed JWTs that expire after 15 minutes. Refresh tokens are opaque, stored only in an HttpOnly cookie, and represented by keyed hashes in MongoDB. Every refresh rotates the token; reuse of an older token revokes that device's session family. Logout ends one device session, while logout-all invalidates every refresh session and existing access token for the user.

Story 1.4 adds:

```text
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

Reset-token hashes and expiry live in the hidden `User.passwordReset` fields. Consumption checks the current hash and expiry, clears the token, changes the password, and increments the session version in one atomic write. Issuance holds a bounded per-user lease; consumption during that lease returns `409 PASSWORD_RESET_IN_PROGRESS`. Failed delivery releases the lease and preserves the previous link. Expired or superseded issuers cannot activate a late SMTP result.

Local upgrade note: reset links from the earlier Story 1.4 draft stored in `OneTimeToken` are intentionally no longer accepted; request a new reset email. Existing accounts and verification links are unaffected. Expired embedded reset hashes are rejected explicitly and overwritten on the next issuance; no TTL index is placed on users.

Story 1.5 adds authenticated basic profiles:

```text
GET   /api/v1/users/me
PATCH /api/v1/users/me
```

Both endpoints require a live bearer session. The GET endpoint returns only `id`, `name`, `email`, `roles`, and `emailVerifiedAt`. PATCH accepts exactly `{ "name": string }`; email, roles, status, passwords, and other fields are rejected. Names are trimmed, limited to 2–100 characters, and cannot contain control or Unicode formatting characters.

Story 2.1 adds instructor applications and administrative review:

```text
POST  /api/v1/instructor-applications
GET   /api/v1/instructor-applications/me
GET   /api/v1/admin/instructor-applications
PATCH /api/v1/admin/instructor-applications/:applicationId
```

Students can have only one pending application, enforced by a partial unique MongoDB index. A rejected student may submit a new application; an approved instructor cannot. Admin listing supports `status`, `page`, and `limit` filters. Approval adds the `instructor` role without removing `student`, while rejection requires a reason. Submission and review update the application and user in real transactions. Startup checks replica set support and initializes the application indexes before accepting HTTP traffic. Integration tests fail on standalone databases; rollback tests are never skipped.

`npm run mongo:local` starts a dedicated loopback-only single-node replica set on port 27018 named `elearnLocal`, using installed `mongod` (override with `MONGOD_BINARY`). Data and logs persist in ignored `.local/mongodb/`. Run it again after restarting the computer. It does not alter the service or data on port 27017. The new development database starts empty; accounts are not automatically migrated. Use the URIs in `.env.example`, or Atlas with separate development and `_test` databases. Startup code `MONGODB_REPLICA_SET_REQUIRED` identifies an unsupported standalone database.

Story 2.2 adds instructor-owned draft courses:

```text
GET   /api/v1/instructor/courses
POST  /api/v1/instructor/courses
GET   /api/v1/instructor/courses/:courseId
PATCH /api/v1/instructor/courses/:courseId
```

Only authenticated instructors can use these endpoints. Every single-course query includes the authenticated owner and `draft` status, preventing cross-instructor access and excluding later workflow states. Creation requires an active category, stores money as a safe integer in the smallest EGP unit, and allocates a globally unique slug through the database unique index with bounded collision retries. Slugs stay stable when titles change. PATCH accepts at least one editable field and rejects ownership, slug, status, and cover-storage fields. List responses are owner-scoped, newest-updated first, and paginated with defaults `page=1`, `limit=20`.

Story 2.3 adds ordered sections and lessons:

```text
GET    /api/v1/instructor/courses/:courseId/sections
POST   /api/v1/instructor/courses/:courseId/sections
PUT    /api/v1/instructor/courses/:courseId/sections/order
PATCH  /api/v1/instructor/courses/:courseId/sections/:sectionId
DELETE /api/v1/instructor/courses/:courseId/sections/:sectionId
POST   /api/v1/instructor/sections/:sectionId/lessons
PUT    /api/v1/instructor/sections/:sectionId/lessons/order
PATCH  /api/v1/instructor/lessons/:lessonId
DELETE /api/v1/instructor/lessons/:lessonId
```

Only the owner can read a course's curriculum; only drafts can be changed. New children append at the next position. Reorder bodies contain `{ "orderedIds": [...] }` and must include the exact current ID set without duplicates. Curriculum writes serialize on the parent course and run in MongoDB transactions, so concurrent appends cannot commit duplicate positions. Deleting a section removes its lessons atomically; deleting sections or lessons compacts the remaining positions. A course or section supports at most 200 direct children.

Story 2.4 adds Mux Direct Uploads:

```text
POST /api/v1/instructor/lessons/:lessonId/video-upload
POST /api/v1/webhooks/video
```

The authenticated endpoint reserves one attempt for an owned draft lesson and returns a temporary URL. The frontend uploads the file directly to Mux; video bytes never pass through Express. Mux webhooks use a raw JSON body and the `mux-signature` header. Valid duplicate events are idempotent, timestamps outside five minutes are rejected, and events from older attempts cannot overwrite the current lesson. S2-10 creates new assets with signed-only playback and adds protected playback issuance and legacy migration.

Set `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, and `MUX_WEBHOOK_SECRET` from the same Mux environment. Set `MUX_UPLOAD_CORS_ORIGIN` to the exact frontend origin. Local configuration defaults to `MUX_TEST_MODE=true`; these test assets are limited to ten seconds and removed after 24 hours. Production startup requires `MUX_TEST_MODE=false`. Deleting a lesson or section records a cleanup job in the same MongoDB transaction; a background worker then removes its Mux upload or asset with bounded retries. See `docs/adr-0004-mux-video.md` for the decision and local webhook forwarding flow.

Sprint 2 Story S2-01 establishes provider contracts without publishing later-story endpoints. Cloudinary signed uploads fix server-generated IDs and use authenticated delivery for PDF attachments. Mux playback IDs are signed-only and playback JWTs expire after 15 minutes. Stripe is restricted to hosted Checkout in Test Mode, EGP, server-owned amounts, idempotent creation, and raw-body webhook verification. Automated tests use injected provider clients and do not claim a live staging integration. See `docs/adr-0005-sprint-2-providers.md` for configuration, trust boundaries, and the mandatory live-provider release checklist.

Sprint 2 Story S2-02 completes the content data needed by later review and catalog stories. Draft courses now carry backward-compatible `shortDescription`, `level`, and `language` fields plus a server-owned normalized search key; lessons support a safe plain-text description. Instructor applications accept up to five normalized HTTPS links. Approval copies the reviewed snapshot into the instructor profile atomically, while rejection leaves it private. Public `GET /api/v1/instructors/:instructorId` returns an allowlisted approved profile, and protected `PATCH /api/v1/instructor/profile` updates bio, expertise, or replaces/clears links without rewriting the historical application. Old records expose empty links and incomplete draft fields without guessed data.

Sprint 2 Story S2-03 adds Cloudinary direct uploads for avatars, draft course covers, and one private PDF per lesson. Create `POST /api/v1/media/upload-intents` with `{purpose,targetId}`, send bytes and the returned signed parameters to the returned Cloudinary URL, then call `POST /api/v1/media/:assetId/confirm` with `{}`. The server fetches Cloudinary metadata before attaching the asset. `DELETE /api/v1/media/:assetId` detaches an owned asset and schedules provider deletion; attached files on courses outside draft state cannot be changed. Pending intents expire for application confirmation after ten minutes. Cloudinary signatures can remain usable for up to one hour, so cleanup of canceled/expired pending uploads is delayed until the provider signature expires plus five minutes for in-flight uploads; `providerUploadValidUntil` in the intent response makes that boundary explicit. PDF download authorization is delivered in S2-10. Signed provider presets restrict image/PDF formats; confirmation enforces byte limits using trusted metadata (Cloudinary does not support per-preset size limits); a live staging upload and privacy check remain release gates.

Cloudinary raw PDF public IDs include `.pdf`; image public IDs do not include their format. Upload every returned signed parameter unchanged. Confirmation derives PDF format from the exact server-owned raw ID because raw metadata may omit `format`. The adapter resolves legacy extensionless PDF IDs for inspection, download, and cleanup without rewriting immutable database identities. Preset environment variables contain names only, never `CLOUDINARY_URL` or credentials.

Sprint 2 Story S2-04 adds paginated public `GET /api/v1/categories` for active categories and admin-only `GET/POST /api/v1/admin/categories` plus `PATCH /api/v1/admin/categories/:categoryId`. Admins can edit name/normalized slug and archive or reactivate with `isActive`; archived categories are never physically removed, so existing course references remain intact. `npm run seed:categories` now inserts missing defaults only and never reactivates or overwrites a category changed by an admin. The shared `ADMIN_WRITE_RATE_LIMIT_*` settings apply to category writes.

Sprint 2 Story S2-05 adds `POST /api/v1/instructor/courses/:courseId/submit-review`, `POST /api/v1/instructor/courses/:courseId/reopen`, `GET /api/v1/admin/courses`, `GET /api/v1/admin/courses/:courseId`, and `PATCH /api/v1/admin/courses/:courseId/review`. Submission and approval require complete course information, an active category, a confirmed cover, nonempty sections, and ready videos for every lesson. Decisions and transitions are atomic with an append-only audit event. Pending, rejected, published, and provider-unavailable courses remain readable to their instructor, but only drafts are editable; rejected or unavailable courses must be reopened explicitly. Provider video webhooks can still update lessons while review is pending; if content changes after submission, approval returns `409 COURSE_CHANGED_DURING_REVIEW` and an admin must reject so the instructor can reopen and resubmit. Duplicate ready webhooks do not change the review revision. If Mux confirms deletion of a published lesson video, the course atomically becomes `unavailable` and receives a system audit event; the owner can explicitly reopen, repair, and resubmit it. Public catalog and later checkout require `published`, never `unavailable`.

Sprint 2 Story S2-06 adds public `GET /api/v1/courses` and `GET /api/v1/courses/:slug`. Listing supports normalized title-prefix search (`q`), category and free/paid filters, and stable newest-first pagination. Details include the public instructor profile and ordered section/lesson summaries, read together in one MongoDB snapshot transaction. An in-flight response can retain its original published snapshot if the course is concurrently reopened, but never mixes in new draft content; subsequent requests return 404. Archived categories do not hide previously published courses; any nonpublished status, including `unavailable`, is hidden. Responses never include Mux asset/upload IDs, signed playback URLs, private PDF references, or account secrets. Cover images use public Cloudinary URLs only for confirmed course-cover assets. Playback and downloads use separate authorized S2-10 endpoints.

Course submission, reopening, and approval require an active, approved instructor with the current instructor role. Publication rechecks that account inside the review transaction and writes a hidden account revision to serialize concurrent suspension or approval revocation. Ineligible approval returns `403 INSTRUCTOR_NOT_APPROVED` without publishing or writing an approval event; rejection remains available to the admin.

Before deploying S2-02 over existing data, run `npm run migrate:sprint2-content` to inspect the candidate counts without writing anything. After reviewing the output and taking the normal database backup, run `npm run migrate:sprint2-content -- --apply`. The migration uses conditional, batched updates, can be rerun safely, and never invents missing course metadata: legacy `level` and `language` remain `null` until an instructor supplies them.

### S2-07 — Orders and Checkout

S2-09 adds free enrollment, the student's library/learning outline, owner-only order
history/polling, and safe admin order reads. See [enrollment and order contracts](docs/enrollment-orders.md)
and [frontend handoff](docs/frontend-handoff.md). S2-11 extends these reads with dynamic progress.

S2-10 adds `GET /api/v1/lessons/:lessonId/playback` and
`GET /api/v1/lessons/:lessonId/attachments/:assetId/download`. See
[protected learning access](docs/protected-learning-access.md) for the permission matrix,
credentials, renewal, expiry, resumable `npm run migrate:signed-playback` deployment steps,
and real-provider privacy release gates. This migration is dry-run by default; `--apply`
removes old public playback IDs. Do not run it blindly against existing public consumers.

S2-11 adds `PUT /api/v1/users/me/courses/:courseId/lessons/:lessonId/progress` with
`{completed:boolean}` and `PUT /api/v1/users/me/courses/:courseId/last-lesson` with `{lessonId}`.
Both require active student enrollment in a published course and share a user-wide quota
of 60/min. Library/learning reads calculate progress from the current curriculum. See
[progress contracts and verification](docs/learning-progress.md).

Payment event setup, retry/replay commands, failure policies, and the real Test Mode
acceptance checklist are documented in [S2-08 payment operations](docs/payment-operations.md).

`POST /api/v1/courses/:courseId/checkout` requires a bearer session belonging to an active,
email-verified student. Send no body, or `{}`. The course must be published and paid, and
the buyer cannot be its owner. Returns `201` for a new attempt or `200` for a resumed one,
with `{ data: { order, checkoutUrl, expiresAt } }` and `Cache-Control: no-store`.

Order/Payment reservation is transactional. A partial unique purchase-slot index protects
each student/course pair; a fenced two-minute Payment lease serializes provider requests.
Money uses minor-unit integers and a BigInt intermediate to allocate 20% to the platform,
rounding down, and the remainder to the instructor. Title, price, currency, instructor,
commission and the complete Stripe create input (including redirect URLs, customer email,
idempotency key and expiry) are immutable snapshots. No client financial fields are accepted.

Stripe requests run outside MongoDB transactions. Short retries reuse the original input
and idempotency key, even after a lost response or a database-write failure. Known sessions
are retrieved rather than recreated. Older unknown sessions use a bounded historical lookup
by order reference instead of replaying a potentially pruned key. A failed or incomplete
lookup leaves the purchase slot reserved and returns a safe `503`; no absence is assumed.
The lookup scans at most 20 pages of 100 sessions within the attempt's creation window.
Large account volumes or genuinely unresolved attempts require operational reconciliation;
S2-08 implements the durable payment-event path, not a second fulfillment path here.

Only confirmed expired/unpaid sessions without a live payment intent release a pending
slot. Explicit Stripe `amount_too_small`/`amount_too_large` validation rejection before
session allocation closes an unallocated attempt as failed. Timeouts, missing sessions,
completed/paid sessions and ambiguous payment-intent states never release the slot.
`409 PAYMENT_PENDING` means wait/retry; `503 PAYMENT_RECONCILIATION_REQUIRED` means the
previous attempt remains unresolved. Existing paid orders reject another purchase.
No Checkout response or success/cancel redirect grants enrollment or records earnings.

`STRIPE_CHECKOUT_EXPIRES_SECONDS` defaults to 1800; the persisted expiry includes a
120-second first-request buffer (capped at 86400) because Stripe requires a minimum
30-minute lifetime at creation. Creation stops once the remaining lifetime reaches that
minimum; retries then use provider lookup. Card Checkout supports server-owned EGP amounts
up to 999999999999 minor units; account/card-network and settlement-currency minimums may
be stricter and must be verified with the project's Stripe Test account. No fixed EGP
minimum is guessed from an exchange rate.

Configure the complete `STRIPE_*` group in `.env.example` using dedicated Test credentials.
The default Checkout limit is five attempts per minute per user; exhausted limits return
429 with retry headers. Unavailable authenticated rate-limit storage fails closed with
`503 RATE_LIMIT_UNAVAILABLE`. Default in-memory stores are single-instance only; provide
the configured shared store factory before deploying multiple API instances.

Shutdown stops new checkout work and fences in-flight attempts before database disconnect.
Already-dispatched Stripe requests cannot be recalled; late results perform no database
writes. Cancelled attempts retain their leases and immutable inputs for recovery after
restart, rather than releasing a possibly payable purchase slot.

Verification: `npm run verify`, or the targeted command:

```powershell
node --import ./tests/setup-env.js --test --test-concurrency=1 tests/checkout.integration.test.js tests/money.test.js tests/provider-contracts.test.js
```

Provider references: [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests),
[Checkout creation](https://docs.stripe.com/api/checkout/sessions/create),
[Checkout lookup](https://docs.stripe.com/api/checkout/sessions/list),
and [currency limits](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts).

Forgot-password always returns the same `202` response and durably queues the request before any account lookup, preventing account enumeration. The worker sends mail only for active accounts. Reset tokens expire after 30 minutes, are stored only as hashes, and can change the password once. A successful reset atomically advances both password and session versions, immediately invalidating every existing access and refresh token even if best-effort session cleanup fails.

Each family allows at most 4096 successful refresh rotations. The next refresh revokes the family and returns `401 INVALID_REFRESH_TOKEN`, requiring login again. The bound is enforced atomically with the hash append. No historical hashes are evicted, preserving replay detection for the whole family lifetime while bounding document and index growth. Existing families already at or above the limit are revoked on their next refresh.

Worker shutdown tracks scheduled and directly invoked jobs. At the authentication-email drain deadline it signals cancellation, preventing subsequent delivery steps and job acknowledgement. Media cleanup signals cancellation immediately, aborts its dedicated Cloudinary request sockets, and starts no subsequent database operations after stopping. Cancelled media jobs keep their leases and become recoverable after lease expiry; deletion is idempotent if the provider accepted it before cancellation. Cloudinary deletion also has a ten-second request deadline. Already-dispatched database writes or SMTP requests cannot be recalled; SMTP acceptance is not proof of token activation, and expired leases permit recovery.

JWTs carry a session identifier. Authentication checks the current user, token version, and the live session on every protected request. Logout and reuse detection therefore reject that device's access tokens on subsequent requests. Logout-all increments the user's version atomically and cleans up only older-version sessions, preserving new logins made after that increment. The version check still denies old credentials if session cleanup fails.

Login, refresh, and logout require an allowed `Origin`, or an allowed `Referer` when `Origin` is absent. Missing or malformed sources return `403 REQUEST_ORIGIN_DENIED`; explicit disallowed origins are rejected by CORS. CLI and Postman clients must send an allowed `Origin` explicitly. `SameSite=Lax` assumes a same-site frontend/API deployment; cross-site cookie deployment is not enabled. Access-token responses use `Cache-Control: no-store`.

Resend and forgot-password return `202` after persisting a request in MongoDB, without looking up the account or waiting for SMTP. The server runs one authentication-email worker that checks eligibility and sends the appropriate email. Jobs contain an email address and purpose, never raw tokens; they expire after 24 hours. A worker claims each job atomically with a ten-minute lease, retries failures up to three attempts with a one-minute delay, and removes completed jobs. Expired leases allow recovery after a restart. Delivery is at-least-once: a crash between SMTP acceptance and job completion may cause a replacement email.

The existing verification token remains valid until SMTP accepts a replacement and its hash is saved. If that database write fails, the original remains usable and the job retries; an accepted email alone cannot prove the new link was activated. Verification consumes the exact current token hash and verifies the user in one MongoDB transaction. That transaction prevents replay and ensures a token replaced concurrently cannot verify the account. A replica set or mongos is therefore required, as described in the database setup above.

Startup retries are cancelled by SIGINT/SIGTERM, including retry backoff. An in-flight MongoDB connection attempt remains bounded by the five-second server-selection timeout and is closed if it completes after cancellation.

## Swagger UI and frontend handoff

With `npm run dev` running on the default port, open `http://localhost:5000/api/v1/docs/`.
Expand an endpoint, select **Try it out**, edit the example, and select **Execute**.
These requests use the actual API and database; register with a test email you control.
The page includes download links for the canonical OpenAPI document:

- `GET /api/v1/openapi.json`
- `GET /api/v1/openapi.yaml` (download)

Share `docs/openapi.yaml` directly with frontend developers for import into their OpenAPI tooling.
For interactive access, share `https://<reachable-api-host>/api/v1/docs/` once the backend is hosted,
or use the backend machine's LAN address when everyone is on the same network and the port is reachable.
`localhost` only works on the machine running the server. No external hosting or tunnel is configured by this change.
Add each frontend browser origin to `CORS_ORIGINS`; the Swagger page calls the API on its own host.
See `docs/frontend-handoff.md` for the integration flow and error handling.

## Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | HTTP port, default `5000` |
| `MONGO_URI` | Development or production MongoDB connection string |
| `MONGO_TEST_URI` | Isolated test database; its name must end in `_test` |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to send credentialed requests |
| `BCRYPT_ROUNDS` | Password hash cost from 10 through 14 |
| `JWT_ACCESS_SECRET` | Random access-token signing secret with at least 32 characters |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Required JWT issuer and audience claims |
| `ACCESS_TOKEN_TTL_SECONDS` | Fixed at `900` (15 minutes) |
| `REFRESH_TOKEN_PEPPER` | Independent random secret used to key refresh-token hashes |
| `REFRESH_TOKEN_TTL_SECONDS` | Refresh-session lifetime, default 30 days |
| `LOG_LEVEL` | Pino log level |
| `SHUTDOWN_TIMEOUT_MS` | Grace period before remaining HTTP connections are force-closed |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops; keep `0` for direct connections |
| `EMAIL_PROVIDER` | `smtp` normally; `memory` is accepted only during tests |
| `EMAIL_FROM` | Sender email address used for verification messages |
| `EMAIL_VERIFICATION_URL` | Frontend HTTP(S) page that receives the opaque token query parameter |
| `PASSWORD_RESET_URL` | Frontend HTTP(S) page that receives the password-reset token query parameter |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server address |
| `SMTP_SECURE` | Use implicit TLS (`true`, normally on port 465) |
| `SMTP_USER` / `SMTP_PASSWORD` | Optional SMTP credentials; both must be provided together |
| `SMTP_CONNECTION_TIMEOUT_MS` | Maximum time to establish the SMTP connection |
| `SMTP_GREETING_TIMEOUT_MS` | Maximum time to wait for the SMTP greeting |
| `SMTP_SOCKET_TIMEOUT_MS` | Maximum idle time for an SMTP operation |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | Mux Video API access credentials |
| `MUX_WEBHOOK_SECRET` | Mux webhook signing secret |
| `MUX_SIGNING_KEY_ID` / `MUX_SIGNING_PRIVATE_KEY` | Independent Mux signed-playback credentials |
| `MUX_PLAYBACK_TOKEN_TTL_SECONDS` | Signed playback lifetime, 60–900 seconds; default 900 |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary account credentials |
| `CLOUDINARY_IMAGE_UPLOAD_PRESET` | Restricted signed JPEG/PNG/WebP preset |
| `CLOUDINARY_ATTACHMENT_UPLOAD_PRESET` | Restricted signed authenticated-PDF preset |
| `CLOUDINARY_UPLOAD_INTENT_TTL_SECONDS` | Application upload-intent lifetime, default 600 seconds |
| `CLOUDINARY_DOWNLOAD_URL_TTL_SECONDS` | Authenticated PDF URL lifetime, 30–60 seconds; default 60 |
| `CLOUDINARY_MAX_IMAGE_BYTES` / `CLOUDINARY_MAX_ATTACHMENT_BYTES` | Confirmation limits, defaults 5 MiB and 20 MiB |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe Test Mode API and webhook secrets |
| `STRIPE_CHECKOUT_SUCCESS_URL` / `STRIPE_CHECKOUT_CANCEL_URL` | Server-approved Checkout redirects |
| `STRIPE_CHECKOUT_EXPIRES_SECONDS` | Hosted Checkout expiry, default 1800 seconds |
| `STRIPE_WEBHOOK_TOLERANCE_SECONDS` | Signature timestamp tolerance, default 300 seconds |
| `STRIPE_API_TIMEOUT_MS` | Stripe SDK request timeout, default 10000 ms |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Per-IP authentication rate-limit window |
| `REGISTER_RATE_LIMIT_MAX` | Registration attempts allowed per window and IP |
| `VERIFY_RATE_LIMIT_MAX` | Verification attempts allowed per window and IP |
| `RESEND_RATE_LIMIT_MAX` | Resend attempts allowed per window and IP |
| `LOGIN_RATE_LIMIT_MAX` | Login attempts allowed per window and IP |
| `REFRESH_RATE_LIMIT_MAX` | Refresh attempts allowed per window and IP |
| `LOGOUT_RATE_LIMIT_MAX` | Current-device logout attempts per window and IP, default 30 |
| `LOGOUT_ALL_RATE_LIMIT_MAX` | All-device logout attempts per window and IP, default 10 |
| `FORGOT_PASSWORD_RATE_LIMIT_MAX` | Password-reset email requests allowed per window and IP |
| `RESET_PASSWORD_RATE_LIMIT_MAX` | Password-reset token attempts allowed per window and IP |
| `ADMIN_NAME` | Admin seed display name |
| `ADMIN_EMAIL` | Admin seed email address |
| `ADMIN_PASSWORD` | Admin seed password; must be set explicitly and contain 12-72 UTF-8 bytes |

Never commit `.env` or copy provider credentials into `.env.example`. Logs redact authorization, cookies, password fields, password hashes, signed URLs, and tokens.

Production requires HTTPS `EMAIL_VERIFICATION_URL` and `PASSWORD_RESET_URL` values, TLS-protected SMTP, and independent deployment-specific authentication secrets. The built-in rate limiter uses process memory and is suitable for a single API instance. Multi-instance deployments must inject a separate shared-store adapter for each limiter through `rateLimitStoreFactory`. Set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops in the deployment; do not enable broad proxy trust.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start with Node watch mode |
| `npm start` | Start the API normally |
| `npm test` | Run serial Node.js and Supertest suites against the test database |
| `npm run lint` | Run ESLint |
| `npm run docs:check` | Validate the required OpenAPI structure |
| `npm run staging:status` | Dry-run read-only operational snapshot; `-- --execute` reads aggregate DB counts |
| `npm run verify` | Run lint, contract validation, and all tests |
| `npm run providers:proof:live -- --execute` | Run the guarded provider smoke test against dedicated Test/Staging accounts |
| `npm run migrate:sprint2-content` | Dry-run the idempotent S2-02 legacy-data migration |
| `npm run migrate:sprint2-content -- --apply` | Apply the reviewed S2-02 legacy-data migration |
| `npm run seed:admin` | Idempotently create or normalize the first admin |
| `npm run seed:categories` | Idempotently create the initial categories |

## Architecture

```text
src/
├── config/       Environment, MongoDB, CORS, and logging
├── models/       Mongoose persistence models
├── middlewares/  Cross-cutting HTTP behavior
├── modules/      Feature-owned schemas, services, controllers, and routes
├── services/     Shared integrations such as email delivery
└── utils/        Shared, framework-light helpers
```

Successful responses use `{ "data": ..., "message": "optional" }`. Errors always use `{ "error": { "code", "message", "details": [] } }`. Client responses never include stack traces or raw internal errors.

The OpenAPI contract for the implemented stories is in `docs/openapi.yaml`.

S2-12 handoff preparation: [staging acceptance runbook](docs/staging-acceptance.md) and
[delivery evidence](docs/staging-evidence.md). Real provider/browser acceptance must be
executed and recorded separately before closing Sprint 2; automated tests are not that proof.
