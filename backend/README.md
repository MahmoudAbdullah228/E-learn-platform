# E-Learning Marketplace API

Stories 1.1 through 1.5 provide the production-oriented foundation, registration, email verification, secure session management, password reset, and basic user profiles. Courses and payments remain outside the current scope.

## Requirements

- Node.js 22.13.0 or newer (`.nvmrc` pins Node.js 22.20.0 LTS)
- MongoDB available locally or through a connection string
- A dedicated MongoDB database for tests whose name ends in `_test`
- An SMTP server or local SMTP catcher for development

## Local setup

```powershell
cd O:\E-learning-platform\backend
npm install
Copy-Item .env.example .env
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

Forgot-password always returns the same `202` response and durably queues the request before any account lookup, preventing account enumeration. The worker sends mail only for active accounts. Reset tokens expire after 30 minutes, are stored only as hashes, and can change the password once. A successful reset atomically advances both password and session versions, immediately invalidating every existing access and refresh token even if best-effort session cleanup fails.

Each family allows at most 4096 successful refresh rotations. The next refresh revokes the family and returns `401 INVALID_REFRESH_TOKEN`, requiring login again. The bound is enforced atomically with the hash append. No historical hashes are evicted, preserving replay detection for the whole family lifetime while bounding document and index growth. Existing families already at or above the limit are revoked on their next refresh.

Worker shutdown tracks scheduled and directly invoked jobs. At the drain deadline it signals cancellation, preventing subsequent delivery steps and job acknowledgement. Already-dispatched database writes or SMTP requests cannot be recalled; SMTP acceptance is not proof of token activation, and expired leases permit recovery.

JWTs carry a session identifier. Authentication checks the current user, token version, and the live session on every protected request. Logout and reuse detection therefore reject that device's access tokens on subsequent requests. Logout-all increments the user's version atomically and cleans up only older-version sessions, preserving new logins made after that increment. The version check still denies old credentials if session cleanup fails.

Login, refresh, and logout require an allowed `Origin`, or an allowed `Referer` when `Origin` is absent. Missing or malformed sources return `403 REQUEST_ORIGIN_DENIED`; explicit disallowed origins are rejected by CORS. CLI and Postman clients must send an allowed `Origin` explicitly. `SameSite=Lax` assumes a same-site frontend/API deployment; cross-site cookie deployment is not enabled. Access-token responses use `Cache-Control: no-store`.

Resend and forgot-password return `202` after persisting a request in MongoDB, without looking up the account or waiting for SMTP. The server runs one authentication-email worker that checks eligibility and sends the appropriate email. Jobs contain an email address and purpose, never raw tokens; they expire after 24 hours. A worker claims each job atomically with a ten-minute lease, retries failures up to three attempts with a one-minute delay, and removes completed jobs. Expired leases allow recovery after a restart. Delivery is at-least-once: a crash between SMTP acceptance and job completion may cause a replacement email.

The existing verification token remains valid until SMTP accepts a replacement and its hash is saved. If that database write fails, the original remains usable and the job retries; an accepted email alone cannot prove the new link was activated. Verification uses an atomic `emailVerifiedAt: null` user update to prevent replay. Token cleanup follows that update; cleanup failure cannot make an already verified account accept the token again. This works on standalone MongoDB without multi-document transactions.

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

Never commit `.env`. Logs redact authorization, cookies, password fields, and password hashes.

Production requires HTTPS `EMAIL_VERIFICATION_URL` and `PASSWORD_RESET_URL` values, TLS-protected SMTP, and independent deployment-specific authentication secrets. The built-in rate limiter uses process memory and is suitable for a single API instance. Multi-instance deployments must inject a separate shared-store adapter for each limiter through `rateLimitStoreFactory`. Set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops in the deployment; do not enable broad proxy trust.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start with Node watch mode |
| `npm start` | Start the API normally |
| `npm test` | Run serial Node.js and Supertest suites against the test database |
| `npm run lint` | Run ESLint |
| `npm run docs:check` | Validate the required OpenAPI structure |
| `npm run verify` | Run lint, contract validation, and all tests |
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
