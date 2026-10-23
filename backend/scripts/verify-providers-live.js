import { randomUUID } from 'node:crypto';

import { v2 as cloudinary } from 'cloudinary';
import Mux from '@mux/mux-node';
import Stripe from 'stripe';

import { env } from '../src/config/env.js';
import { createCloudinaryMediaProvider } from '../src/services/cloudinaryMedia.service.js';
import { createMuxVideoProvider } from '../src/services/muxVideo.service.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';

const required = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_IMAGE_UPLOAD_PRESET',
  'CLOUDINARY_ATTACHMENT_UPLOAD_PRESET',
  'MUX_TOKEN_ID',
  'MUX_TOKEN_SECRET',
  'MUX_SIGNING_KEY_ID',
  'MUX_SIGNING_PRIVATE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CHECKOUT_SUCCESS_URL',
  'STRIPE_CHECKOUT_CANCEL_URL',
];

const missing = required.filter(name => !env[name]);
if (!process.argv.includes('--execute')) {
  process.stderr.write(
    'Live provider proof changes external Test/Staging state. Re-run with --execute after '
      + 'reading docs/adr-0005-sprint-2-providers.md.\n',
  );
  process.exitCode = 2;
} else if (missing.length > 0 || !process.env.PROVIDER_PROOF_MUX_ASSET_ID) {
  const missingNames = [
    ...missing,
    ...(!process.env.PROVIDER_PROOF_MUX_ASSET_ID ? ['PROVIDER_PROOF_MUX_ASSET_ID'] : []),
  ];
  process.stderr.write(`Provider proof configuration is incomplete: ${missingNames.join(', ')}\n`);
  process.exitCode = 2;
} else {
  await runProof();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function uploadSigned(intent, bytes, filename, contentType) {
  const body = new FormData();
  body.set('api_key', intent.apiKey);
  body.set('signature', intent.signature);
  for (const [name, value] of Object.entries(intent.parameters)) body.set(name, String(value));
  body.set('file', new Blob([bytes], { type: contentType }), filename);

  const response = await fetch(intent.uploadUrl, {
    method: 'POST', body, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Cloudinary signed upload returned HTTP ${response.status}`);
  return response.json();
}

async function verifyCloudinary(proofId) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  const provider = createCloudinaryMediaProvider();
  const imagePublicId = `provider-proof/${proofId}/image`;
  const pdfPublicId = `provider-proof/${proofId}/attachment.pdf`;
  const uploaded = [];

  try {
    const imageIntent = provider.createSignedUpload({
      publicId: imagePublicId, purpose: 'course_cover',
    });
    const image = await uploadSigned(
      imageIntent,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
      'proof.png',
      'image/png',
    );
    uploaded.push({ publicId: imagePublicId, resourceType: 'image', deliveryType: 'upload' });
    assert(image.public_id === imagePublicId && image.resource_type === 'image',
      'Cloudinary returned unexpected image metadata');

    const pdfIntent = provider.createSignedUpload({
      publicId: pdfPublicId, purpose: 'lesson_attachment',
    });
    const pdf = await uploadSigned(
      pdfIntent,
      Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
      'proof.pdf',
      'application/pdf',
    );
    uploaded.push({
      publicId: pdfPublicId, resourceType: 'raw', deliveryType: 'authenticated',
    });
    assert(pdf.public_id === pdfPublicId && pdf.resource_type === 'raw'
      && pdf.type === 'authenticated', 'Cloudinary returned an unsafe PDF delivery type');

    const unsignedUrls = [
      `https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}`
        + `/raw/upload/${pdfPublicId}`,
      `https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}`
        + `/raw/authenticated/${pdfPublicId}`,
    ];
    for (const url of unsignedUrls) {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      assert(!response.ok, 'Cloudinary exposed a protected PDF without a signature');
    }

    const download = provider.createPrivateDownload({ publicId: pdfPublicId });
    const signedResponse = await fetch(download.url, { signal: AbortSignal.timeout(15_000) });
    assert(signedResponse.ok, 'Cloudinary rejected its authenticated PDF download URL');
    process.stdout.write('Cloudinary live proof passed.\n');
  } finally {
    for (const asset of uploaded.reverse()) {
      try {
        const result = await cloudinary.uploader.destroy(asset.publicId, {
          resource_type: asset.resourceType,
          type: asset.deliveryType,
          invalidate: true,
        });
        assert(result.result === 'ok', 'Cloudinary proof cleanup was not confirmed');
      } catch {
        process.stderr.write('Warning: a Cloudinary proof asset requires manual cleanup.\n');
      }
    }
  }
}

async function verifyMux() {
  const mux = new Mux({ tokenId: env.MUX_TOKEN_ID, tokenSecret: env.MUX_TOKEN_SECRET });
  const provider = createMuxVideoProvider({ muxClient: mux });
  const assetId = process.env.PROVIDER_PROOF_MUX_ASSET_ID;
  const before = await mux.video.assets.retrieve(assetId);
  assert(before.status === 'ready', 'Mux proof requires a ready dedicated test asset');
  assert(Array.isArray(before.playback_ids) && !before.playback_ids.some(item => item.policy !== 'signed'),
    'Mux proof will not change existing public policies; migrate a dedicated test asset separately');
  const existingSigned = before.playback_ids?.find(item => item.policy === 'signed');
  let playbackId;

  try {
    playbackId = await provider.ensureSignedPlaybackId({ assetId });
    const { token } = await provider.signPlaybackToken(playbackId);
    const unsigned = await fetch(`https://stream.mux.com/${playbackId}.m3u8`, {
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    assert(!unsigned.ok, 'Mux served signed playback without a token');
    const signed = await fetch(`https://stream.mux.com/${playbackId}.m3u8?token=${token}`, {
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    assert(signed.ok, 'Mux rejected its signed playback token');
    process.stdout.write('Mux live proof passed.\n');
  } finally {
    if (!existingSigned && playbackId) {
      try {
        await mux.video.assets.deletePlaybackId(assetId, playbackId);
      } catch {
        process.stderr.write('Warning: the Mux proof playback ID requires manual cleanup.\n');
      }
    }
  }
}

async function verifyStripe(proofId) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  const provider = createStripePaymentProvider({ stripeClient: stripe });
  let session;
  try {
    const input = {
      orderId: `proof-${proofId}`,
      courseTitle: 'Provider contract proof',
      amountMinor: 100,
      customerEmail: 'provider-proof@example.com',
      idempotencyKey: `provider-proof:${proofId}`,
      expiresAtSeconds: Math.floor(Date.now() / 1000) + env.STRIPE_CHECKOUT_EXPIRES_SECONDS,
    };
    session = await provider.createCheckoutSession(input);
    const repeated = await provider.createCheckoutSession(input);
    assert(session.id === repeated.id, 'Stripe did not honor the Checkout idempotency key');

    const rawBody = Buffer.from(JSON.stringify({
      id: `evt_${proofId.replaceAll('-', '')}`,
      type: 'checkout.session.completed',
    }));
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody.toString('utf8'),
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
    provider.unwrapWebhook({ rawBody, signature });
    process.stdout.write('Stripe Test Mode live proof passed.\n');
  } finally {
    if (session?.id) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        process.stderr.write('Warning: the Stripe Test Checkout will expire automatically.\n');
      }
    }
  }
}

async function runProof() {
  const proofId = randomUUID();
  let stage = 'Cloudinary';
  try {
    await verifyCloudinary(proofId);
    stage = 'Mux';
    await verifyMux();
    stage = 'Stripe';
    await verifyStripe(proofId);
    process.stdout.write('All live provider proofs passed.\n');
  } catch {
    process.stderr.write(`${stage} live provider proof failed; inspect provider dashboards safely.\n`);
    process.exitCode = 1;
  }
}
