# Frontend API handoff — Stories 1.1 through 1.4

Base URL: `<backend-origin>/api/v1`. Swagger: `<backend-origin>/api/v1/docs/`.
Import the attached `openapi.yaml` or download `/api/v1/openapi.json` from the running API.
The specification uses `/api/v1` on the documentation host. When importing a local file,
set your client's backend origin explicitly. JSON request bodies require `Content-Type: application/json`.

| Method | Path | Request | Success |
| --- | --- | --- | --- |
| GET | `/health` | None | 200, `{ data: { status: "ok", uptimeSeconds: number } }` |
| POST | `/auth/register` | `{ name, email, password }` | 201, `{ data: { user }, message }` |
| POST | `/auth/verify-email` | `{ token }` | 200, `{ data: { verified: true }, message }` |
| POST | `/auth/resend-verification` | `{ email }` | 202, `{ data: {}, message }` |
| POST | `/auth/login` | `{ email, password }` | 200, `{ data: { accessToken, expiresInSeconds, user }, message }` + cookie |
| POST | `/auth/refresh` | HttpOnly cookie | 200, `{ data: { accessToken, expiresInSeconds }, message }` + rotated cookie |
| POST | `/auth/logout` | Optional HttpOnly cookie | 200, `{ data: {}, message }` |
| POST | `/auth/logout-all` | Bearer access token | 200, `{ data: {}, message }` |
| POST | `/auth/forgot-password` | `{ email }` | 202, `{ data: {}, message }` |
| POST | `/auth/reset-password` | `{ token, password }` | 200, `{ data: { passwordReset: true }, message }` |

Registration creates students only. Do not send `roles`, `status`, or other extra fields.
Names are trimmed (2–100 characters); emails are normalized to lowercase.
Passwords need at least 8 characters and must fit within 72 UTF-8 bytes (including non-ASCII characters).

After registration, show a check-your-email screen. The configured frontend verification page
receives `?token=...`; send that value in the JSON body of `/auth/verify-email`.
Do not log or store the token permanently. Clear it from the address bar after reading it.
Email delivery must be configured on the backend. Tokens are never returned by registration or resend.

All errors have `{ error: { code, message, details: [] } }`:

| Status / code | Frontend action |
| --- | --- |
| 400 `VALIDATION_ERROR` | Display field errors from `details` |
| 400 `INVALID_JSON` | Fix JSON serialization and send valid JSON |
| 404 `ROUTE_NOT_FOUND` | Check the API version, URL, and HTTP method |
| 413 `PAYLOAD_TOO_LARGE` | Reduce the request body; JSON requests are limited to 1 MB |
| 400 `INVALID_OR_EXPIRED_VERIFICATION_TOKEN` | Offer a new verification email |
| 400 `INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN` | Show an expired/invalid link message and offer a new reset email |
| 409 `PASSWORD_RESET_IN_PROGRESS` | Wait briefly and retry, or use the replacement email link when it arrives |
| 409 `RESOURCE_ALREADY_EXISTS` | Account cannot be registered again; offer resend |
| 429 rate-limit error | Respect the `Retry-After` header before allowing another attempt |
| 401 `INVALID_CREDENTIALS` | Show a generic email/password error |
| 401 `INVALID_REFRESH_TOKEN` | Clear local auth state and return to login |
| 401 `AUTHENTICATION_REQUIRED` | Refresh once, then return to login if refresh fails |
| 403 `EMAIL_NOT_VERIFIED` | Return to the check-email flow |
| 403 `ACCOUNT_SUSPENDED` | Show the account support message |
| 403 `INSUFFICIENT_PERMISSIONS` | Hide the action and show a permission message |
| 403 `REQUEST_ORIGIN_DENIED` / `CORS_ORIGIN_DENIED` | Check that the exact frontend origin is configured on the API |
| 503 `EMAIL_DELIVERY_UNAVAILABLE` on registration | Account was created; offer resend instead of registration retry |
| 500 `INTERNAL_SERVER_ERROR` | Show a generic retry message |

Resend 202 means queued, not delivered, and is identical for unknown, verified, suspended,
and unverified accounts. The worker retries transient failures; do not reveal account existence in the UI.
Health indicates the API process is alive, not that SMTP delivery is working.

Suspension returns `403 ACCOUNT_SUSPENDED` during login with correct credentials. Existing access tokens are rejected with `401 AUTHENTICATION_REQUIRED` on protected routes, and refresh returns `401 INVALID_REFRESH_TOKEN`. Clear local auth state after refresh fails.

Logout and logout-all are rate-limited too. A `429` does not confirm server-side revocation: honor `Retry-After` and retry. Rate-limit responses include the draft-8 `RateLimit` and `RateLimit-Policy` headers. Successful logout responses expire the refresh cookie through `Set-Cookie`.

## Session flow

1. Send credentials to `POST /api/v1/auth/login` with `credentials: 'include'`.
2. Keep the returned access token in application memory and send it as `Authorization: Bearer <token>`.
3. On expiry, call `POST /api/v1/auth/refresh` with `credentials: 'include'`; replace the in-memory access token with the response value.
4. Call `POST /api/v1/auth/logout` to end the current device session, or authenticated `POST /api/v1/auth/logout-all` to end every session.

The refresh token is an HttpOnly cookie and is intentionally unavailable to frontend JavaScript.

## Password-reset flow

1. Submit the normalized email to `POST /auth/forgot-password` and always show the same check-your-email screen after `202`.
2. Read `?token=...` from the configured reset page, remove it from the address bar, and never log or persist it.
3. Submit `{ token, password }` to `POST /auth/reset-password`.
4. On success, clear all in-memory authentication state and route to login; every previous device session is invalid.

Reset links expire after 30 minutes and work once. A newer accepted reset email replaces the older link. The forgot response is intentionally identical for unknown, suspended, and active accounts.

A session allows up to 4096 refresh rotations. Once exhausted, refresh returns `401 INVALID_REFRESH_TOKEN` and ends that device session; show login again. Historical token hashes are retained rather than evicted, so replay detection remains intact.
Use `credentials: 'include'` for login, refresh, and logout. Registration and email-verification endpoints do not require an Authorization header.

Login, refresh, and logout require a trusted `Origin`, falling back to `Referer` only when Origin is absent. Browsers send these headers automatically; CLI/Postman clients must supply an allowed Origin. Add the backend Swagger origin to `CORS_ORIGINS` to test locally. Cookies use SameSite=Lax, so frontend and API must be on the same site for browser refresh requests.

Coordinate refresh requests through one shared promise (and across browser tabs). Reusing the same refresh cookie concurrently is treated as replay and revokes that device's family, including its access tokens. Logout also invalidates that device's access tokens immediately for subsequent requests; other devices remain signed in. Logout-all invalidates credentials issued under older user versions; a new login after that version change remains valid.
