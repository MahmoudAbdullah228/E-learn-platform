# S2-10 — Protected learning access

Implemented locally: routes, strict Zod parameters/query validation, controllers, a shared
snapshot access resolver, provider adapters, cross-process playback policy leases, resumable
legacy migration, safe errors, no-store responses and isolated MongoDB integration tests.
No progress writes or payment/refund operations belong to this story.

## Access policy

| Caller | Published preview video | Other published video | Private PDF | Unpublished course |
| --- | --- | --- | --- | --- |
| Anonymous | Allowed | 403 | 401 | 404 |
| Active verified student, no enrollment | Allowed | 403 | 403 | 404 |
| Active verified student, active enrollment | Allowed | Allowed | Allowed | 404 |
| Revoked enrollment | Allowed as preview | 403 | 403 | 404 |
| Active verified approved course owner / current admin | Allowed | Allowed | Allowed | Allowed for review |
| Invalid supplied token, revoked session, suspended/unverified account | 401 | 401 | 401 | 401 |

Video must be ready and bound to a non-deleted Mux asset, including for reviewers.
An attachment must be a ready `lesson_attachment`, raw/authenticated PDF, owned by the
course instructor, targeted at this exact lesson, and present in its attachment list.
The upload intent deadline does not expire an already confirmed attachment.
Missing/private content is hidden with 404. Other known errors include
`ENROLLMENT_REQUIRED`, `VIDEO_NOT_READY`, `VIDEO_STATE_CHANGED`, `VIDEO_ASSET_UNAVAILABLE`,
`PLAYBACK_PREPARING`, `VIDEO_PROVIDER_UNAVAILABLE`, and `MEDIA_PROVIDER_UNAVAILABLE`.
All errors use the shared envelope without provider internals or secrets.

## Frontend contracts

`GET /api/v1/lessons/:lessonId/playback`, optionally with Bearer auth for a published preview:

```json
{"data":{"playbackId":"signed-id","token":"signed-jwt","expiresAt":"2026-10-04T10:15:00.000Z"}}
```

Use the signed ID and `token` with Mux video playback (JWT audience `v`). Do not construct
unsigned links or assume this video token grants thumbnail/storyboard access. Renew before
`expiresAt` for longer lessons; a 503 `PLAYBACK_PREPARING` is retryable with bounded backoff.

`GET /api/v1/lessons/:lessonId/attachments/:assetId/download`, with Bearer auth:

```json
{"data":{"url":"https://api.cloudinary.com/...","expiresAt":"2026-10-04T10:01:00.000Z"}}
```

Obtain ready PDF `assetId` values from the authenticated learning outline's
`course.sections[].lessons[].attachments` array. Owner/admin curriculum reads also expose
attachment IDs. These are database IDs, not provider IDs or public URLs.
Open the returned HTTPS download URL directly; request a new URL after expiry. Treat it
as a credential: no logging, analytics collection, persistent storage, or public sharing.
Send no query parameters to either endpoint. All responses, including errors, are no-store.

Default lifetimes: video 900 seconds (configurable down to 60), PDF 60 seconds (down to 30).
The video response expiry comes from the actual signed JWT's `exp`, not an estimated clock.
Already-issued credentials remain usable until expiry even after revocation or suspension;
the API rechecks current user/session, publication, enrollment and media binding immediately
before returning new credentials. This is short-lived bearer access, not DRM or instant
revocation of an issued URL.

Playback and downloads share `learning-access` quota: 30/min per authenticated user across
every lesson. Anonymous previews use `preview`: 20/min per normalized IP. Invalid supplied
credentials never fall back to preview. 429 includes Retry-After and the safe envelope;
shared-store failure returns 503 `RATE_LIMIT_UNAVAILABLE`. Process memory is single-instance
only; configure a shared adapter per namespace before multi-instance deployment.

## Provider configuration and legacy migration

Mux needs API credentials, `MUX_SIGNING_KEY_ID`, and its corresponding private signing key
(`MUX_SIGNING_PRIVATE_KEY`); JWT signing is local to the server. New direct uploads request
`playback_policies: ['signed']`. Existing assets are retrieved and their signed ID reused
or created; every public playback ID is removed, then provider state is checked again.
Adding a signed ID alone does not disable a public ID. Provider I/O is outside MongoDB
transactions; SDK requests use 10-second timeouts without automatic retries.

Policy upgrade uses `VideoPlaybackLease`: unique provider asset `_id`, scoped random owner,
120-second expiry and TTL index. Concurrent preparation returns retryable 503. Expired
leases can be reclaimed without waiting for TTL cleanup. API operations have a 30-second
deadline; shutdown aborts issuance and drains up to `SHUTDOWN_TIMEOUT_MS`. Uncertain canceled
operations retain their lease until expiry rather than unlock remote work still in flight.
Late results do not issue credentials, write application state or release another owner's lease.

Before deployment, secure **all** legacy assets, not just ones subsequently requested:

```powershell
npm run migrate:signed-playback -- --limit=50
npm run migrate:signed-playback -- --apply --limit=50
npm run migrate:signed-playback -- --apply --limit=50 --after=<previous-nextAfter>
```

Dry-run is the default and does not call Mux. `--apply` changes Mux playback policies and
breaks old public playback links, including public preview links; previews must now go
through the authorized issuance endpoint. Take a backup and review the counts/impact first.
Keep the starting cursor for each page. If `failed > 0` (exit code 1), retry the **same page**
before advancing. Reruns reuse provider state after partial failures. An empty next page
finishes the scan. Stop HTTP writes/uploads while doing the final deployment sweep.
Missing or terminally errored assets are marked failed with a deletion tombstone; published
courses become unavailable with an audit event and require a replacement upload. A late
ready event cannot revive the tombstoned old asset.

Cloudinary requires configured server credentials and authenticated/raw PDF uploads.
The server signs private downloads with resource/type fixed to raw/authenticated and
`expires_at`; the client cannot choose public IDs, resource settings or expiry.

## Verification and release gates

```powershell
node --import ./tests/setup-env.js --test --test-concurrency=1 tests/learning-access.integration.test.js tests/provider-contracts.test.js
npm run verify
```

Tests use the explicitly isolated replica-set test database, never development data.
Adapters/real SDK signing tests prove contracts and cryptography, **not account-level media privacy**.
Before release on the project's actual staging accounts, demonstrate and record:

- Enrolled student/owner/admin access and unauthorized/preview PDF denial.
- Mux playback with a valid signed token; unsigned and expired-token requests denied.
- Asset inspection confirms no public playback ID, including all migrated legacy assets.
- Original and derived PDF URLs cannot be publicly retrieved; authenticated download works
  before expiry and fails afterwards on the project's Cloudinary account.
- Long-video token renewal and HTTP 429/503 bounded-retry behavior in the actual frontend.

Do not treat this story as release-approved until those real-provider proofs pass.
No live migration/proof command was executed as part of the automated implementation.

Local verification record (2026-10-04): `npm run verify` passed lint, OpenAPI validation,
and **371 tests: 371 passed, 0 failed, 0 skipped** on the isolated MongoDB replica-set test
database. The learning-access integration suite includes permission, binding, concurrency,
revocation, deadline, shutdown and migration cases. This is not a staging-provider acceptance record.

References: [Mux secure playback](https://www.mux.com/docs/guides/secure-video-playback),
[Mux playback policy migration](https://www.mux.com/docs/prompts/video-paywall),
[Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media).
