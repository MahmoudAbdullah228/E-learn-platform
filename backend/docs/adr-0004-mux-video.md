# ADR 0004 — Mux Video direct uploads

## Status

Accepted for Story 2.4.

## Decision

Use Mux Video through the official `@mux/mux-node` SDK. The API creates a short-lived
Direct Upload URL after authenticating the instructor and verifying ownership of a lesson
inside an owned draft course. The browser uploads the file directly to Mux; Express never
receives or buffers video bytes.

New assets use `video_quality=basic`. No playback policy is created in this story, so an
uploaded course video does not receive a public playback ID accidentally. Secure playback
tokens belong to the enrollment/playback story. Development defaults to Mux test assets,
which are watermarked, limited to ten seconds, and removed after 24 hours. Production must
set `MUX_TEST_MODE=false`; startup rejects test mode in that environment.

Each upload attempt gets an application UUID stored on the lesson and sent as Mux
`passthrough`. Webhooks update only the matching current attempt. This prevents delayed
events from an abandoned or superseded upload from changing the lesson. Status transitions
are monotonic: `pending -> processing -> ready|failed`; repeated events are idempotent and
late `created` or `errored` events cannot regress a ready video.

Mux webhook requests use the untouched JSON body. The official SDK verifies the
`mux-signature` HMAC, and the adapter additionally rejects timestamps more than five minutes
old or in the future. The endpoint returns a successful acknowledgement for valid events
that do not belong to a current lesson so Mux does not retry unrelated or obsolete events.

Lesson and section deletion records provider cleanup in a transactional outbox before the
lesson disappears. A leased background worker cancels unused uploads or deletes assets and
retains failed jobs for bounded backoff retries. `video.asset.deleted` also changes a matching
lesson to `failed`, allowing the instructor to request a replacement upload.

Asset lifecycle records serialize `ready` and `deleted` events for the same Mux asset. A
deletion is terminal even when webhook delivery is reordered or concurrent. Failed lessons
retain their provider identifiers until the replacement transaction durably queues cleanup.
Shutdown aborts an in-flight Mux cleanup request and prevents newly claimed jobs from starting.

## Configuration

- `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`: Video read/write access token.
- `MUX_WEBHOOK_SECRET`: signing secret for this environment's webhook endpoint.
- `MUX_UPLOAD_CORS_ORIGIN`: exact frontend origin accepted by Direct Upload URLs.
- `MUX_UPLOAD_TIMEOUT_SECONDS`: URL lifetime, 60 seconds to seven days; default 3600.
- `MUX_VIDEO_QUALITY`: `basic`, `plus`, or `premium`; default `basic`.
- `MUX_TEST_MODE`: `true` for the local spike, `false` for production assets.

Production config requires all three secrets and an HTTPS upload origin. Secrets are never
returned, stored in MongoDB, or included in logs.

## Flow

1. The instructor calls `POST /api/v1/instructor/lessons/:lessonId/video-upload`.
2. The API reserves one upload attempt transactionally and asks Mux for a Direct Upload URL.
3. The frontend uploads the selected file to that URL using Mux Uploader/UpChunk or an HTTP
   `PUT`; it does not send the file to this API.
4. Mux posts signed lifecycle events to `POST /api/v1/webhooks/video`.
5. `video.upload.asset_created`, `video.asset.created`, `video.asset.ready`, and failure
   events update `videoAssetId`, `videoStatus`, and rounded-up `durationSeconds` idempotently.

For local webhook forwarding, use the Mux CLI and set the signing secret it prints:

```powershell
mux webhooks listen --forward-to http://localhost:5000/api/v1/webhooks/video
```

In production, configure the public HTTPS webhook URL in the same Mux environment as the
API token. Mux retries non-2xx deliveries, so handlers must remain idempotent.

## Email proof

The SMTP adapter and bounded delivery worker were already exercised by Stories 1.2 and 1.4,
including acceptance/failure, retry, cancellation, and token-activation tests. Story 2.4
keeps that implementation and adds this recorded Mux decision rather than replacing the
mail provider.
