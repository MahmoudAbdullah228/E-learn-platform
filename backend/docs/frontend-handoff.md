# Frontend API handoff — Sprint 1 and implemented Sprint 2 stories

Base URL: `<backend-origin>/api/v1`. Swagger: `<backend-origin>/api/v1/docs/`.
For coordinated Sprint 2 acceptance, use [the staging runbook](staging-acceptance.md)
and [evidence record](staging-evidence.md). Staging acceptance is not yet recorded.
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
| GET | `/instructors/:instructorId` | None | 200, `{ data: { instructor } }` for an active approved instructor |
| PATCH | `/instructor/profile` | Instructor Bearer token + partial `{ bio, expertise, links }` | 200, `{ data: { instructor }, message }` |
| POST | `/media/upload-intents` | Bearer token + `{ purpose, targetId }` | 201, `{ data: { assetId, upload, maxBytes } }` |
| POST | `/media/:assetId/confirm` | Bearer token + `{}` after direct Cloudinary upload | 200, `{ data: { asset } }` |
| DELETE | `/media/:assetId` | Bearer token | 204; detaches and queues cleanup |
| POST | `/instructor-applications` | Bearer token + `{ bio, expertise, links? }` | 201, `{ data: { application }, message }` |
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
| POST | `/instructor/sections/:sectionId/lessons` | Instructor Bearer token + `{ title, description?, isPreview? }` | 201, `{ data: { lesson } }` |
| PUT | `/instructor/sections/:sectionId/lessons/order` | Instructor Bearer token + `{ orderedIds }` | 200, `{ data: { lessons } }` |
| PATCH | `/instructor/lessons/:lessonId` | Instructor Bearer token + partial `{ title, description, isPreview }` | 200, `{ data: { lesson } }` |
| DELETE | `/instructor/lessons/:lessonId` | Instructor Bearer token | 200, `{ data: { deletedId } }` |
| POST | `/instructor/lessons/:lessonId/video-upload` | Instructor Bearer token; no file/body required | 201, `{ data: { upload: { id, url, timeoutSeconds, videoStatus } } }` |
| POST | `/webhooks/video` | Mux only: raw JSON + `mux-signature` | 200, `{ data: { received, handled } }` |

Registration creates students only. Do not send `roles`, `status`, or other extra fields.

For direct Cloudinary uploads, send all returned `upload.parameters` unchanged, including
the `.pdf` suffix in raw attachment `public_id`. Do not add or remove extensions, override
delivery type, or construct your own PDF URL; use the authorized attachment-download API.
Check `maxBytes` before uploading for UX. This browser check is bypassable; confirmation
also enforces size using trusted provider metadata. Presets do not enforce per-preset size.
Names are trimmed (2–100 characters); emails are normalized to lowercase.

Profile display: `GET/PATCH /users/me` and public/edited instructor profiles now return
`avatarUrl` alongside `avatarAssetId`. Render `avatarUrl` directly; use a placeholder when
it is null. Never construct a provider URL from a MongoDB asset ID, and do not send either
field in profile PATCH bodies. Avatar changes still use upload-intent → direct upload →
confirm, or the existing media DELETE endpoint. Refetch the profile after confirmation,
replacement or removal. URLs are returned only for ready, public images associated with
their actual owner; no private PDF or another user's image is resolved as an avatar.

`GET /courses/:slug` includes `sectionCount`, `lessonCount`, `totalDurationSeconds`, and
`unknownDurationCount`, calculated from the same displayed curriculum snapshot. Duration
is seconds, not minutes: format it in the UI. A null total means incomplete duration data
or a sum outside safe JSON integer limits; do not display it as zero or as a known partial
sum. `unknownDurationCount` counts lessons lacking a ready video and positive confirmed
duration. An empty legacy curriculum returns counts and total duration zero. No new
request fields, endpoints or persisted duration/count snapshots are needed.
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
| 404 `INSTRUCTOR_NOT_FOUND` | Hide the public profile; the account is absent, inactive, or not approved |
| 409 `INSTRUCTOR_PROFILE_INCOMPLETE` | Ask a legacy instructor to provide both bio and expertise before partial edits |
| 400 `INVALID_CATEGORY` | Refresh categories and require an active category |
| 404 `COURSE_NOT_FOUND` | Remove missing or foreign course state from the current instructor UI |
| 409 `INVALID_COURSE_STATE` | Show the read-only status; only drafts are editable, and rejected or provider-unavailable courses need reopen |
| 409 `COURSE_NOT_READY` | Show `error.details[0]` and ask the instructor to finish the missing content |
| 409 `COURSE_CHANGED_DURING_REVIEW` | Admin should reject and ask the instructor to reopen and resubmit the changed course |
| 409 `COURSE_SLUG_CONFLICT` | Keep the form values and allow the instructor to retry creation |
| 404 `CURRICULUM_NOT_FOUND` | Reload the course; the content is missing or not owned |
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

1. Submit `{ bio, expertise, links? }` to `POST /instructor-applications`. Bio is 50–2000 characters and expertise is 2–200 characters. Links are an optional list of at most five strict `{ label, url }` objects; URLs must be HTTPS, cannot contain credentials, and must be unique after normalization.
2. Read `GET /instructor-applications/me` to show the latest status. `application` is `null` when the user has never applied.
3. For the admin UI, call `GET /admin/instructor-applications?status=pending&page=1&limit=20`. The maximum limit is 100.
4. Approve with `{ "status": "approved" }`, or reject with `{ "status": "rejected", "rejectionReason": "..." }` where the reason is 5–500 characters.

Only an admin can list or review applications. A reviewed application is immutable. Rejected users may submit a new application, while approved users cannot. After approval, existing access tokens can use instructor permissions on subsequent requests because the backend reloads current roles from the database. Application responses use `Cache-Control: no-store`.

Approval copies the reviewed links into the public instructor profile. Rejection never publishes them. Read a public approved profile with `GET /instructors/:instructorId`; it contains only `id`, `name`, `avatarAssetId`, `bio`, `expertise`, and `links`, never email or account status. `PATCH /instructor/profile` is partial: omitting `links` preserves the list, `links: []` clears it, and sending a list replaces it. Profile edits never modify the historical application. Render labels as text and use `rel="noopener noreferrer"` for links opened in a new tab; these are instructor-provided links, not platform-verified endorsements.

For direct media upload, request an intent with `purpose` (`avatar`, `course_cover`, or `lesson_attachment`) and the target's ID. The avatar target is the current user ID; covers require an owned draft course, and a PDF requires a lesson in an owned draft course. Send the file directly to `upload.uploadUrl` using `api_key`, `signature`, every `upload.parameters` field, and `file`. Do not send bytes or claimed MIME/size metadata to the backend. Call confirm with `{}` before showing the media as attached. Use returned `maxBytes` for client-side feedback; the server checks Cloudinary's recorded format and size again. `upload.expiresAt` is the ten-minute application confirmation deadline; `upload.providerUploadValidUntil` can be later because Cloudinary may still accept the signature. An expired or deleted intent must not be reused, and cleanup may be delayed past that provider deadline. A lesson accepts one PDF. Replacing a cover/avatar queues the old asset for deletion. Deleting a media ID detaches it first; provider cleanup is asynchronous. Only IDs appear in course/profile/lesson responses. Do not construct private PDF links from an ID; S2-10 adds authorized temporary download URLs.

For category pickers, call public `GET /categories?page=1&limit=20`; it returns active categories only with `data.categories` and `data.pagination`. Admins can list all categories through `GET /admin/categories`, optionally filtering `isActive=true|false`, create with `{name,slug}`, and PATCH by ID with any subset of `{name,slug,isActive}`. Slugs must already be normalized lowercase Unicode letters/numbers separated by hyphens; duplicate slugs return `409 CATEGORY_SLUG_EXISTS`. Archive with `isActive:false` rather than deleting. Existing courses retain the category reference, but archived categories cannot be selected for new draft courses. Render category names as plain text.

For course review, the owner dashboard still defaults to `status=draft` but accepts `pending_review`, `published`, `rejected`, and `unavailable`. Owner GET and curriculum GET work in all states; PATCH/section/lesson/video/media edits work only in draft. Submit a complete draft with `POST /instructor/courses/:courseId/submit-review` (no body). The API requires a short description, level, language, active category, confirmed cover, at least one nonempty section, and ready video for every lesson; `409 COURSE_NOT_READY` includes a safe field hint. Admins review via `GET /admin/courses?status=pending_review`, inspect `GET /admin/courses/:courseId`, and decide with `PATCH /admin/courses/:courseId/review` using `{decision:"approve"}` or `{decision:"reject",reason:"..."}`. A rejected owner course shows `rejectionReason`; a published course whose video is deleted by Mux becomes `unavailable` with `unavailableAt` and a system `unpublished` audit event (`actorId: null`). Neither state is editable until the owner explicitly calls `POST /instructor/courses/:courseId/reopen`, repairs the draft, and resubmits it. Approval timestamps the published course. Never show an admin review decision as final until its API response succeeds; concurrent decisions return `409 INVALID_COURSE_STATE`.

The public catalog now exposes `GET /courses?q=&categoryId=&pricing=all|free|paid&page=1&limit=20` and `GET /courses/:slug` without login. Search is a normalized title prefix, not fuzzy/full-text. Listing is newest first with a stable ID tie-breaker. Only `published` courses appear; an archived category does not automatically hide an already published course. The safe DTO includes a public `coverUrl` when its confirmed cover exists, a public instructor summary, and ordered curriculum outlines with duration and preview flags on details. It never includes Mux IDs, playback tokens, PDF attachments, or private user fields. Use the separate S2-10 endpoints below for preview playback and protected PDF downloads; do not construct media URLs from lesson IDs.

## Stripe Test Checkout — S2-07

S2-08 adds `POST /api/v1/webhooks/stripe` for **Stripe only**, not the browser.
Its `{ data: { received: true } }` response acknowledges durable receipt, not payment.
The worker verifies payment and creates enrollment/earnings atomically. Library/order
reads are now available in S2-09; use the owner-only order URL below. See
[payment operations](payment-operations.md) for backend setup and recovery.

Call `POST /api/v1/courses/:courseId/checkout` with a student bearer token and no body
(or `{}`). Never send amounts, commission, provider references or return URLs. New attempts
return 201; resumed attempts return 200. Navigate to `data.checkoutUrl`, and retain the
safe `data.order.id`. Checkout responses use `Cache-Control: no-store`.

`409 PAYMENT_PENDING` means an existing attempt is being prepared or needs confirmation;
wait and retry the same course. A 503 must not trigger creation of a different purchase
or a client-generated idempotency key. `PAYMENT_RECONCILIATION_REQUIRED` needs resolution
of the prior attempt. `PAYMENT_AMOUNT_UNSUPPORTED` indicates an unprocessable course price.
Respect 429 Retry-After. A success or cancel page never changes an order or grants access.

This story creates hosted Stripe Test checkout only. Payment webhooks and transactional
enrollment/earnings are processed by the S2-08 worker; S2-09 adds owner-only polling/library reads.
Do not display "enrolled" based on a redirect. Confirm persisted paid status and refresh
the library. Protected playback/downloads use S2-10 endpoints below; progress uses S2-11;
real Stripe Test staging proof is still required before shipping the full purchase flow.

## Library and order reads — S2-09

All routes require a current verified active bearer session and use `Cache-Control: no-store`.
Send no body or `{}` to `POST /courses/:courseId/enroll`: 201 creates one free enrollment;
200 returns existing active access, with no fake financial records. Paid courses require
checkout (409); a pending purchase blocks free enrollment even after a price change.
Revoked enrollment is not silently restored. Do not send studentId, sourceOrderId, or price.

- `GET /users/me/courses`: `{data:{courses:[{enrollment,course,available}],pagination}}`;
  status=active (default), revoked, or all; page/limit. Nonpublished/deleted course is null.
- `GET /users/me/courses/:courseId`: `{data:{enrollment,course}}` with safe ordered curriculum;
  S2-10 adds ready PDF attachment database IDs, not provider IDs, attachment links, or playback URLs.
  404 when not enrolled; 409 when unavailable.
- `GET /users/me/orders`: `{data:{orders,pagination}}`; optional status, page/limit.
- `GET /users/me/orders/:orderId`: `{data:{order,payment}}`; identical 404 for missing/non-owned IDs.
- Admin: `GET /admin/orders` (status/studentId/courseId/page/limit) and `GET /admin/orders/:orderId`.
  Admin orders also include the recorded commission/split; no provider secrets or mutable payment action.

After returning from Stripe, poll the saved order ID every 5 seconds, back off to 30 seconds,
and stop automatically after two minutes with manual refresh. Timeout does not mean failure
or authorize a new Checkout. Respect 429 Retry-After. Reads never call Stripe or fulfill.
Library/order/admin reads share the authenticated user's private-read quota (120/min default).
Free enrollment has its own user-wide quota (10/min default). Shared-store failure returns 503.

S2-11 adds dynamic `progress` to available library entries and the learning outline. Read
`progress.percentage`, not a stored completion timestamp or resume position. Unavailable/revoked
library entries return progress null. See [progress contracts](learning-progress.md).

## Learning progress — S2-11

- `PUT /users/me/courses/:courseId/lessons/:lessonId/progress` with `{completed:true}` or
  `{completed:false}` returns `{data:{lessonProgress,enrollment,progress}}`. Boolean strings
  and extra fields are rejected. Repeated true preserves its timestamp; false clears it.
- `PUT /users/me/courses/:courseId/last-lesson` with `{lessonId}` returns
  `{data:{enrollment,progress}}`. This does not mark completion, and completion writes do not
  advance resume automatically. Both operations require an active enrollment and published course.
- The existing learning outline adds `completed`/`completedAt` to each lesson and `progress`
  at data level. Available library entries add the same progress summary:
  `{totalLessons,completedLessons,percentage,completedAt}`. Percentage floors to two decimals,
  zero lessons gives 0%, and deleted/foreign progress records do not contribute.
- Preview/owner/admin review privileges do not permit progress writes without enrollment.
  All writes are no-store and share one user-wide quota (60/min), separate from private reads.
  Coordinate contradictory writes; concurrent requests are serialized but arrival order is not
  guaranteed. Respect 429 Retry-After. No query parameters, student IDs or timestamps are accepted.

Progress is self-reported completion, not proof that the student watched a video. Show
the returned canonical state. A later curriculum change can reduce the displayed percentage.

## Protected learning media — S2-10

- `GET /lessons/:lessonId/playback`: `{data:{playbackId,token,expiresAt}}`. A published
  preview video allows anonymous access; other published videos require active enrollment.
  Current approved course owners/admins can review without enrollment. Supplying an invalid
  Bearer token returns 401 and never falls back to anonymous preview. Use the signed Mux
  ID and video token; renew before the returned expiry (maximum 15 minutes).
- `GET /lessons/:lessonId/attachments/:assetId/download`: Bearer required,
  `{data:{url,expiresAt}}`. Get asset IDs from the authenticated learning outline's lesson
  `attachments` array. Preview never grants PDF access. Open the temporary URL directly;
  renew on expiry (maximum 60 seconds). Never persist or log these bearer credentials.
- Both endpoints reject query parameters, return no-store even on errors, and share a
  user-wide quota of 30/min; anonymous video previews have a separate IP quota of 20/min.
  Respect 429 Retry-After and retry 503 PLAYBACK_PREPARING with bounded backoff.

Revocation prevents new credentials, not use of an already issued token/URL until expiry.
See [protected learning access](protected-learning-access.md) for all policies and staging gates.

## Draft course flow

Create a course with `title`, `categoryId`, `description`, and integer `priceMinor`. Sprint 2 also accepts `shortDescription` (empty while drafting or 10–300 characters), `level` (`beginner`, `intermediate`, `advanced`, `all_levels`), and `language` (`ar`, `en`). Older drafts return an empty short description and null level/language; the later review submission will require them before publication. `requirements` and `learningOutcomes` are optional arrays of up to 30 unique strings, and currency defaults to `EGP`. Do not send `slug`, `status`, `instructorId`, `titleSearch`, or `coverKey`; the API owns those fields. The selected category must still be active when the request reaches the API.

Use `GET /instructor/courses` for the dashboard and `GET /instructor/courses/:courseId` for the owner's course details. The list defaults to drafts and accepts a status filter; detail reads work in every state. PATCH is partial, requires at least one editable field, and works only in draft. A title change does not change the slug. `category` can be `null` if its original database record was deleted; retain `categoryId` and prompt the instructor to choose an active category. Prices are returned in the smallest EGP unit and should be formatted for display without floating-point persistence.

## Curriculum flow

Load the editor with `GET /instructor/courses/:courseId/sections`; sections and nested lessons are already ordered by `position`. Create operations append automatically, so the frontend must not send a position. To reorder, send every current sibling ID exactly once in the desired order. If the API returns `409 INVALID_CURRICULUM_ORDER`, reload before retrying because another request changed the set. Section deletion also removes its lessons. Lesson create accepts plain-text `description` up to 10000 characters and `isPreview` (default `false`); `title`, `description`, and `isPreview` are editable while the course remains a draft.

## Mux video upload flow

1. Call `POST /instructor/lessons/:lessonId/video-upload` without sending the file.
2. Give `data.upload.url` to Mux Uploader/UpChunk, or upload the selected file directly to that URL. Never persist or log the temporary URL.
3. Keep the lesson UI in `pending`/`processing`. Reload the curriculum to observe webhook-driven `videoStatus` and `durationSeconds` changes.
4. `ready` means processing completed. New uploads use signed-only playback; request authorized playback through the S2-10 endpoint, never an unsigned provider URL.

The browser must not call `/webhooks/video`; it is a provider callback. A second upload is rejected while one is pending/processing and after it becomes ready. Failed attempts may request a new URL. Development Mux test assets accept only short proof-of-concept videos.

A session allows up to 4096 refresh rotations. Once exhausted, refresh returns `401 INVALID_REFRESH_TOKEN` and ends that device session; show login again. Historical token hashes are retained rather than evicted, so replay detection remains intact.
Use `credentials: 'include'` for login, refresh, and logout. Registration and email-verification endpoints do not require an Authorization header.

Login, refresh, and logout require a trusted `Origin`, falling back to `Referer` only when Origin is absent. Browsers send these headers automatically; CLI/Postman clients must supply an allowed Origin. Add the backend Swagger origin to `CORS_ORIGINS` to test locally. Cookies use SameSite=Lax, so frontend and API must be on the same site for browser refresh requests.

Coordinate refresh requests through one shared promise (and across browser tabs). Reusing the same refresh cookie concurrently is treated as replay and revokes that device's family, including its access tokens. Logout also invalidates that device's access tokens immediately for subsequent requests; other devices remain signed in. Logout-all invalidates credentials issued under older user versions; a new login after that version change remains valid.
