# E-Learning Marketplace API

Story 1.1 provides the production-oriented backend foundation for the marketplace. It intentionally contains no registration, login, course, or payment endpoints yet.

## Requirements

- Node.js 22.13.0 or newer (`.nvmrc` pins Node.js 22.20.0 LTS)
- MongoDB available locally or through a connection string
- A dedicated MongoDB database for tests whose name ends in `_test`

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

## Environment

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
| `ADMIN_NAME` | Admin seed display name |
| `ADMIN_EMAIL` | Admin seed email address |
| `ADMIN_PASSWORD` | Admin seed password; must be set explicitly and contain 12-72 UTF-8 bytes |

Never commit `.env`. Logs redact authorization, cookies, password fields, and password hashes.

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
├── modules/      Feature-owned controllers and routes
├── services/     Use-case and integration orchestration
└── utils/        Shared, framework-light helpers
```

Successful responses use `{ "data": ..., "message": "optional" }`. Errors always use `{ "error": { "code", "message", "details": [] } }`. Client responses never include stack traces or raw internal errors.

The Story 1.1 OpenAPI contract is in `docs/openapi.yaml`.
