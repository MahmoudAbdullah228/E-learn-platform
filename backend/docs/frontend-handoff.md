# Frontend API handoff — Stories 1.1 through 2.4

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
| GET | `/users/me` | Bearer access token | 200, `{ data: { user } }` |
| PATCH | `/users/me` | Bearer token + `{ name }` | 200, `{ data: { user }, message }` |
| POST | `/instructor-applications` | Bearer token + `{ bio, expertise }` | 201, `{ data: { application }, message }` |
| GET | `/instructor-applications/me` | Bearer token | 200, `{ data: { application } }` |
| GET | `/admin/instructor-applications` | Admin Bearer token + optional `status`, `page`, `limit` | 200, `{ data: { applications, pagination } }` |
| PATCH | `/admin/instructor-applications/:applicationId` | Admin Bearer token + approval or rejection body | 200, `{ data: { application }, message }` |
| GET | `/instructor/courses` | Instructor Bearer token + optional `status=draft`, `page`, `limit` | 200, `{ data: { courses, pagination } }` |
| POST | `/instructor/courses` | Instructor Bearer token + course input | 201, `{ data: { course }, message }` |
| GET | `/instructor/courses/:courseId` | Instructor Bearer token | 200, `{ data: { course } }` |
| PATCH | `/instructor/courses/:courseId` | Instructor Bearer token + partial course input | 200, `{ data: { course }, message }` |
| GET | `/instructor/courses/:courseId/sections` | Instructor Bearer token | 200, `{ data: { sections } }`, each section includes ordered lessons |
| POST | `/instructor/courses/:courseId/sections` | Instructor Bearer token + `{ title }` | 201, `{ data: { section } }` |
| PUT | `/instructor/courses/:courseId/sections/order` | Instructor Bearer token + `{ orderedIds }` | 200, `{ data: { sections } }` |
| PATCH | `/instructor/courses/:courseId/sections/:sectionId` | Instructor Bearer token + `{ title }` | 200, `{ data: { section } }` |
| DELETE | `/instructor/courses/:courseId/sections/:sectionId` | Instructor Bearer token | 200, `{ data: { deletedId } }` |
| POST | `/instructor/sections/:sectionId/lessons` | Instructor Bearer token + `{ title, isPreview? }` | 201, `{ data: { lesson } }` |
| PUT | `/instructor/sections/:sectionId/lessons/order` | Instructor Bearer token + `{ orderedIds }` | 200, `{ data: { lessons } }` |
| PATCH | `/instructor/lessons/:lessonId` | Instructor Bearer token + partial `{ title, isPreview }` | 200, `{ data: { lesson } }` |
| DELETE | `/instructor/lessons/:lessonId` | Instructor Bearer token | 200, `{ data: { deletedId } }` |
| POST | `/instructor/lessons/:lessonId/video-upload` | Instructor Bearer token; no file/body required | 201, `{ data: { upload: { id, url, timeoutSeconds, videoStatus } } }` |
| POST | `/webhooks/video` | Mux only: raw JSON + `mux-signature` | 200, `{ data: { received, handled } }` |

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
| 409 `APPLICATION_ALREADY_PENDING` | Show the existing pending application instead of resubmitting |
| 409 `INSTRUCTOR_ALREADY_APPROVED` | Refresh user permissions and hide the application action |
| 409 `APPLICATION_ALREADY_REVIEWED` | Refresh the admin review list; another review already won |
| 409 `APPLICANT_STATE_CONFLICT` | Refresh the application and applicant state before retrying |
| 400 `INVALID_CATEGORY` | Refresh categories and require an active category |
| 404 `COURSE_NOT_FOUND` | Remove inaccessible/non-draft course state from the current instructor UI |
| 409 `COURSE_SLUG_CONFLICT` | Keep the form values and allow the instructor to retry creation |
| 404 `CURRICULUM_NOT_FOUND` | Reload the draft; the course/content is missing, non-draft, or not owned |
| 409 `INVALID_CURRICULUM_ORDER` | Reload all siblings and resend their exact current ID set |
| 409 `CURRICULUM_LIMIT_REACHED` | Disable adding more direct children; the maximum is 200 |
| 409 `VIDEO_UPLOAD_IN_PROGRESS` | Keep showing progress; do not request another URL |
| 409 `VIDEO_ALREADY_EXISTS` | Keep the ready video; replacement is not part of Story 2.4 |
| 503 `VIDEO_PROVIDER_UNAVAILABLE` | Preserve UI state and let the instructor retry later |
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

## Basic profile flow

Use `GET /users/me` after login or a successful refresh to load the current public profile. Use `PATCH /users/me` to change the display name. Send only `{ name }`; the API rejects email, role, status, password, and unknown fields. Replace the locally cached user object with the returned value after an update. A `401` means the access token, account, or device session is no longer valid; follow the normal refresh flow once.

## Instructor application flow

If an applicant account was deleted, admin listing retains its original `userId` and returns `applicant: null`; display an unavailable-account label. Omitted pagination defaults to `page=1` and `limit=20`.

1. Submit `{ bio, expertise }` to `POST /instructor-applications`. Bio is 50–2000 characters and expertise is 2–200 characters.
2. Read `GET /instructor-applications/me` to show the latest status. `application` is `null` when the user has never applied.
3. For the admin UI, call `GET /admin/instructor-applications?status=pending&page=1&limit=20`. The maximum limit is 100.
4. Approve with `{ "status": "approved" }`, or reject with `{ "status": "rejected", "rejectionReason": "..." }` where the reason is 5–500 characters.

Only an admin can list or review applications. A reviewed application is immutable. Rejected users may submit a new application, while approved users cannot. After approval, existing access tokens can use instructor permissions on subsequent requests because the backend reloads current roles from the database. Application responses use `Cache-Control: no-store`.

## Draft course flow

Create a course with `title`, `categoryId`, `description`, and integer `priceMinor`. `requirements` and `learningOutcomes` are optional arrays of up to 30 unique strings, and currency defaults to `EGP`. Do not send `slug`, `status`, `instructorId`, or `coverKey`; the API owns those fields. The selected category must still be active when the request reaches the API.

Use `GET /instructor/courses` for the dashboard and `GET /instructor/courses/:courseId` for editing. Both expose only the authenticated instructor's drafts. PATCH is partial but must contain at least one editable field. A title change does not change the slug. `category` can be `null` if its original database record was deleted; retain `categoryId` and prompt the instructor to choose an active category. Prices are returned in the smallest EGP unit and should be formatted for display without floating-point persistence.

## Curriculum flow

Load the editor with `GET /instructor/courses/:courseId/sections`; sections and nested lessons are already ordered by `position`. Create operations append automatically, so the frontend must not send a position. To reorder, send every current sibling ID exactly once in the desired order. If the API returns `409 INVALID_CURRICULUM_ORDER`, reload before retrying because another request changed the set. Section deletion also removes its lessons. Lesson create accepts `isPreview` (default `false`); only `title` and `isPreview` are directly editable.

## Mux video upload flow

1. Call `POST /instructor/lessons/:lessonId/video-upload` without sending the file.
2. Give `data.upload.url` to Mux Uploader/UpChunk, or upload the selected file directly to that URL. Never persist or log the temporary URL.
3. Keep the lesson UI in `pending`/`processing`. Reload the curriculum to observe webhook-driven `videoStatus` and `durationSeconds` changes.
4. `ready` means processing completed. Story 2.4 intentionally exposes no public playback ID; playback authorization will be added with enrollment access.

The browser must not call `/webhooks/video`; it is a provider callback. A second upload is rejected while one is pending/processing and after it becomes ready. Failed attempts may request a new URL. Development Mux test assets accept only short proof-of-concept videos.

A session allows up to 4096 refresh rotations. Once exhausted, refresh returns `401 INVALID_REFRESH_TOKEN` and ends that device session; show login again. Historical token hashes are retained rather than evicted, so replay detection remains intact.
Use `credentials: 'include'` for login, refresh, and logout. Registration and email-verification endpoints do not require an Authorization header.

Login, refresh, and logout require a trusted `Origin`, falling back to `Referer` only when Origin is absent. Browsers send these headers automatically; CLI/Postman clients must supply an allowed Origin. Add the backend Swagger origin to `CORS_ORIGINS` to test locally. Cookies use SameSite=Lax, so frontend and API must be on the same site for browser refresh requests.

Coordinate refresh requests through one shared promise (and across browser tabs). Reusing the same refresh cookie concurrently is treated as replay and revokes that device's family, including its access tokens. Logout also invalidates that device's access tokens immediately for subsequent requests; other devices remain signed in. Logout-all invalidates credentials issued under older user versions; a new login after that version change remains valid.
