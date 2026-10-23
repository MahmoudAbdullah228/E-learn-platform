# ADR 0005 — Sprint 2 media, playback, and payment providers

## Status

Accepted for Sprint 2 Story S2-01. This ADR establishes provider contracts; it does not
publish the later media, playback, checkout, or Stripe webhook endpoints.

## Decision

Use three isolated adapters under `src/services`:

- Cloudinary for JPEG/PNG/WebP images and PDF lesson attachments.
- Mux Video for direct video upload and signed playback.
- Stripe hosted Checkout in Test Mode for one-course EGP purchases.

Controllers and domain services must depend on these adapters rather than provider SDKs.
Provider errors are converted to stable `ApiError` codes and no raw error, credential,
signature, signed URL, webhook body, or playback token may be logged or sent as error detail.

## Cloudinary contract

The API, not the browser, generates each `publicId`, selects its upload preset, fixes
`overwrite=false`, and signs the complete parameter set. Avatars and course covers use the
`image/upload` endpoint. Lesson PDFs use `raw/upload` with delivery type `authenticated`.
Upload intents expire in the application after ten minutes by default; this is not a claim
that Cloudinary's signature has the same independent expiry behavior.

The later confirmation story must query Cloudinary and verify public ID, resource type,
delivery type, format, byte limit, and ownership before marking a `MediaAsset` ready. It must
not trust metadata returned by the browser. PDF access uses an authenticated private-download
URL valid for 60 seconds by default and forces attachment delivery. A public-origin and
derived-resource privacy check is a required live-provider acceptance test before release.

Raw PDF public IDs include `.pdf`; raw provider metadata may omit `format`. Confirmation
uses the exact server-owned raw ID and trusted resource/delivery/byte metadata to infer PDF
format only when absent, rejecting contradictory format values. New intents sign and store
the extension-bearing ID. Legacy extensionless PDF IDs are resolved at the adapter boundary
for inspection, download and cleanup, preserving immutable database identities. Image IDs
remain extensionless. Preset configuration accepts preset names, never credential URLs.

Upload presets must be signed, disallow arbitrary transformations, and restrict formats
to JPEG/PNG/WebP or PDF as applicable. Cloudinary does not support per-preset file-size
limits; the frontend checks the configured 5 MiB image and 20 MiB PDF application limits
for user feedback, and confirmation must enforce them using trusted provider metadata.
Frontend checks are bypassable and do not prevent oversized direct uploads; Cloudinary
account-level limits and application rate limits mitigate, but do not eliminate, that
resource-cost risk. See [upload preset security](https://cloudinary.com/documentation/upload_presets).

## Mux contract

New and existing assets receive only a `signed` playback ID. The adapter first retrieves the
asset and reuses an existing signed ID; otherwise it creates one, making retry behavior safe.
Playback JWTs use a Mux signing key separate from the API access token and expire after 15
minutes by default. The token and signed playback ID stay out of ordinary course DTOs.

S2-10 extends ADR 0004's direct-upload settings to signed-only playback. Legacy upgrades
use cross-process asset leases, remove public IDs, and confirm the provider state before
issuance. Playback tokens are issued only after the shared access policy has established
preview, ownership/review, or active enrollment, and permissions are rechecked before return.
The returned expiry matches the actual JWT exp; 900 seconds is the maximum allowed lifetime.
PDF download URLs have a maximum lifetime of 60 seconds. See
[protected learning access](protected-learning-access.md) for migration and staging gates.

## Stripe contract

Only `sk_test_` keys are accepted. Hosted Checkout is fixed to `payment`, card, `egp`, one
line item, and server-owned amount/title/order metadata. The API chooses success/cancel URLs,
and every create retry uses the same idempotency key. The adapter rejects any response marked
live. Its internal result includes normalized amount, currency, order references, session and
payment-intent state for server-side validation; the public Checkout DTO exposes no provider
IDs or private payment input.

The caller must persist `expiresAtSeconds` (Unix seconds) together with the idempotency key
and immutable checkout input before calling `createCheckoutSession`. Compute it once using
`STRIPE_CHECKOUT_EXPIRES_SECONDS`; never recompute it on retry. Reuse the complete snapshot
after timeouts or process restarts, including the original checkout redirect configuration.
The adapter deliberately does not reject a snapshot based on the current clock: an old retry
may retrieve a previously created session. Stripe validates expiry for a genuinely new request.

S2-07 persists Order/Payment and the redirect/input snapshot transactionally before creation.
A fenced two-minute Payment lease serializes external creation, retrieval and recovery.
The checkout service adds a 120-second initial expiry buffer (capped at 24 hours). Once less
than 30 minutes remain, unknown attempts use a bounded historical session lookup instead of
creating with an old, potentially pruned key. Known sessions are always retrieved. Missing
or ambiguous evidence preserves the purchase slot. Confirmed expired/unpaid sessions with
no live payment intent close atomically; explicit amount-validation rejection before session
allocation can close a never-allocated attempt. No redirect, polling, or Checkout response
performs payment fulfillment; S2-08's durable verified event worker owns fulfillment.

Webhook verification receives the untouched request `Buffer` and the `Stripe-Signature`
header. Express raw-body routing precedes JSON parsing on `/api/v1/webhooks/stripe`.
A valid signature alone does not fulfill an order: the durable inbox worker verifies event,
session, order, amount, currency, and Test Mode before the transactional purchase effect.

## Configuration and release proof

Development and test may omit a complete provider group. Providing only part of a group
fails startup. Production requires all Cloudinary values, the Mux API/webhook and signing
credentials, and all Stripe Test Mode values. Checkout and frontend URLs require HTTPS in
production. Multiline Mux private keys may use literal `\n` separators in the environment.

Automated tests prove parameter ownership, safe error normalization, authenticated PDF
delivery settings, signed-only playback behavior, token TTL, Test Mode Checkout shape,
idempotency, and raw webhook verification. They use injected clients and make no network
calls. Live staging proof is intentionally not claimed until deployment credentials exist:

1. Upload an allowed and an oversized/disallowed image through the restricted preset.
2. Upload a PDF, confirm public and derived URLs fail, and confirm the signed download expires.
3. Create/reuse a signed Mux playback ID and verify playback fails without/after the JWT.
4. Create a Stripe Test Checkout, pay with a test card, replay its signed event, and verify
   the later durable handler applies the purchase exactly once.

Failure of any live privacy, signature, or Test Mode assertion blocks release.

Run the guarded smoke test only against dedicated Test/Staging accounts:

```powershell
npm run providers:proof:live -- --execute
```

It refuses to run without an explicit `--execute`, a complete provider configuration, and
`PROVIDER_PROOF_MUX_ASSET_ID` pointing to an existing ready non-production asset. The command
uploads then removes one image and one authenticated PDF, temporarily creates and removes a
signed playback ID only when the asset did not already have one, and creates then expires a
Stripe Test Checkout. Cleanup warnings require a dashboard check. It prints no credentials,
signed URLs, tokens, webhook bodies, or raw provider errors.

## Application rate-limit namespaces

Sprint 2 reserves independent configuration pairs for `CHECKOUT`, `MEDIA_INTENT`,
`MEDIA_ACTION`, `ENROLL`, `COURSE_REVIEW`, `INSTRUCTOR_PROFILE`, `ADMIN_WRITE`,
`LEARNING_ACCESS`, `PREVIEW`, `LEARNING_PROGRESS`, `PRIVATE_READ`, and `CATALOG`.
Every pair uses `*_RATE_LIMIT_MAX` and `*_RATE_LIMIT_WINDOW_MS`; defaults are recorded in
`.env.example`. Authenticated groups key by user ID and public catalog/preview groups by the
normalized client IP. Their owning stories add middleware and tests before exposing routes.

Provider webhooks do not share browser or user limiter buckets. They use a one MiB raw-body
limit, signature verification, and provider/infrastructure controls so valid bursts are not
silently discarded. Oversized raw webhook bodies already have an HTTP contract test.
