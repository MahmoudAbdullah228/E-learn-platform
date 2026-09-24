# E-Learning Marketplace API

Stories 1.1 and 1.2 provide the production-oriented foundation, student registration, and one-time email verification. Login, sessions, courses, and payments remain outside the current scope.

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

Resend returns `202` after persisting a request in MongoDB, without looking up the account or waiting for SMTP. The server runs a verification worker that checks eligibility and sends the email. Jobs contain an email address, never raw tokens; they expire after 24 hours. A worker claims each job atomically with a ten-minute lease, retries failures up to three attempts with a one-minute delay, and removes completed jobs. Expired leases allow recovery after a restart. Delivery is at-least-once: a crash between SMTP acceptance and job completion may cause a replacement email.

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
| `LOG_LEVEL` | Pino log level |
| `SHUTDOWN_TIMEOUT_MS` | Grace period before remaining HTTP connections are force-closed |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops; keep `0` for direct connections |
| `EMAIL_PROVIDER` | `smtp` normally; `memory` is accepted only during tests |
| `EMAIL_FROM` | Sender email address used for verification messages |
| `EMAIL_VERIFICATION_URL` | Frontend HTTP(S) page that receives the opaque token query parameter |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server address |
| `SMTP_SECURE` | Use implicit TLS (`true`, normally on port 465) |
| `SMTP_USER` / `SMTP_PASSWORD` | Optional SMTP credentials; both must be provided together |
| `SMTP_CONNECTION_TIMEOUT_MS` | Maximum time to establish the SMTP connection |
| `SMTP_GREETING_TIMEOUT_MS` | Maximum time to wait for the SMTP greeting |
| `SMTP_SOCKET_TIMEOUT_MS` | Maximum idle time for an SMTP operation |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Per-IP registration/resend rate-limit window |
| `REGISTER_RATE_LIMIT_MAX` | Registration attempts allowed per window and IP |
| `VERIFY_RATE_LIMIT_MAX` | Verification attempts allowed per window and IP |
| `RESEND_RATE_LIMIT_MAX` | Resend attempts allowed per window and IP |
| `ADMIN_NAME` | Admin seed display name |
| `ADMIN_EMAIL` | Admin seed email address |
| `ADMIN_PASSWORD` | Admin seed password; must be set explicitly and contain 12-72 UTF-8 bytes |

Never commit `.env`. Logs redact authorization, cookies, password fields, and password hashes.

Production requires an HTTPS `EMAIL_VERIFICATION_URL` and TLS-protected SMTP. The built-in rate limiter uses process memory and is suitable for a single API instance. Multi-instance deployments must inject a separate shared-store adapter for each limiter through `rateLimitStoreFactory`. Set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops in the deployment; do not enable broad proxy trust.

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
