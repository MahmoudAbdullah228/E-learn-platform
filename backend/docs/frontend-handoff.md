# Frontend API handoff — Stories 1.1 through 1.3

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
| 400 `INVALID_OR_EXPIRED_VERIFICATION_TOKEN` | Offer a new verification email |
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

## Session flow

1. Send credentials to `POST /api/v1/auth/login` with `credentials: 'include'`.
2. Keep the returned access token in application memory and send it as `Authorization: Bearer <token>`.
3. On expiry, call `POST /api/v1/auth/refresh` with `credentials: 'include'`; replace the in-memory access token with the response value.
4. Call `POST /api/v1/auth/logout` to end the current device session, or authenticated `POST /api/v1/auth/logout-all` to end every session.

The refresh token is an HttpOnly cookie and is intentionally unavailable to frontend JavaScript. Password reset belongs to a later story.
Use `credentials: 'include'` for login, refresh, and logout. Registration and email-verification endpoints do not require an Authorization header.

Login, refresh, and logout require a trusted `Origin`, falling back to `Referer` only when Origin is absent. Browsers send these headers automatically; CLI/Postman clients must supply an allowed Origin. Add the backend Swagger origin to `CORS_ORIGINS` to test locally. Cookies use SameSite=Lax, so frontend and API must be on the same site for browser refresh requests.

Coordinate refresh requests through one shared promise (and across browser tabs). Reusing the same refresh cookie concurrently is treated as replay and revokes that device's family, including its access tokens. Logout also invalidates that device's access tokens immediately for subsequent requests; other devices remain signed in. Logout-all invalidates credentials issued under older user versions; a new login after that version change remains valid.
