import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import Mux from '@mux/mux-node';
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';
import Stripe from 'stripe';

import { createCloudinaryMediaProvider } from '../src/services/cloudinaryMedia.service.js';
import { createMuxVideoProvider } from '../src/services/muxVideo.service.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';
import { cloudinaryPublicId } from '../src/utils/cloudinaryPublicId.js';

const now = new Date('2026-09-30T10:00:00.000Z');

test('raw PDF IDs normalize legacy values exactly once and reject unsafe extensions', () => {
  assert.equal(cloudinaryPublicId('lesson/file', 'raw'), 'lesson/file.pdf');
  assert.equal(cloudinaryPublicId('lesson/file.pdf', 'raw'), 'lesson/file.pdf');
  assert.equal(cloudinaryPublicId('lesson/file', 'image'), 'lesson/file');
  for (const value of ['../file', 'file.zip', 'file.pdf.pdf', 'file.pdf/other',
    'file?token=x', '', null, 42, 'x'.repeat(252)]) {
    assert.throws(() => cloudinaryPublicId(value, 'raw'), /server-generated/);
  }
  assert.throws(() => cloudinaryPublicId('lesson/file.pdf', 'image'), /server-generated/);
});
const liveProofScript = fileURLToPath(
  new URL('../scripts/verify-providers-live.js', import.meta.url),
);

test('Cloudinary signs server-owned image and authenticated PDF upload parameters', () => {
  const signed = [];
  const client = {
    utils: {
      api_sign_request(parameters, secret) {
        signed.push({ parameters, secret });
        return 'signed-value';
      },
      private_download_url() {
        throw new Error('not used');
      },
    },
  };
  const provider = createCloudinaryMediaProvider({
    cloudName: 'example-cloud',
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    imageUploadPreset: 'signed-images',
    attachmentUploadPreset: 'signed-attachments',
    clock: () => now,
    cloudinaryClient: client,
  });

  const image = provider.createSignedUpload({
    publicId: 'users/owner/avatar-asset', purpose: 'avatar',
  });
  const attachment = provider.createSignedUpload({
    publicId: 'lessons/lesson/attachment-asset', purpose: 'lesson_attachment',
  });

  assert.match(image.uploadUrl, /\/image\/upload$/);
  assert.equal(image.deliveryType, 'upload');
  assert.equal(attachment.resourceType, 'raw');
  assert.equal(attachment.deliveryType, 'authenticated');
  assert.equal(attachment.parameters.type, 'authenticated');
  assert.equal(attachment.parameters.public_id, 'lessons/lesson/attachment-asset.pdf');
  assert.equal(attachment.parameters.overwrite, false);
  assert.equal(attachment.parameters.upload_preset, 'signed-attachments');
  assert.equal(attachment.expiresAt.toISOString(), '2026-09-30T10:10:00.000Z');
  assert.deepEqual(signed.map(entry => entry.secret), ['api-secret', 'api-secret']);
  assert.equal('apiSecret' in attachment, false);
  assert.equal(provider.publicImageUrl({ publicId: 'users/owner/avatar-asset', format: 'png' }),
    'https://res.cloudinary.com/example-cloud/image/upload/users/owner/avatar-asset.png');
  assert.equal(provider.publicImageUrl({ publicId: 'users/owner/avatar-asset', format: 'pdf' }),
    null);
  assert.throws(
    () => provider.createSignedUpload({ publicId: '../foreign/asset', purpose: 'avatar' }),
    /server-generated Cloudinary public ID/,
  );
});

test('Cloudinary creates a short-lived authenticated PDF download URL', () => {
  let request;
  const provider = createCloudinaryMediaProvider({
    cloudName: 'example-cloud',
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    imageUploadPreset: 'signed-images',
    attachmentUploadPreset: 'signed-attachments',
    clock: () => now,
    cloudinaryClient: {
      utils: {
        api_sign_request: () => 'unused',
        private_download_url(publicId, format, options) {
          request = { publicId, format, options };
          return 'https://api.cloudinary.com/private-download';
        },
      },
    },
  });

  const result = provider.createPrivateDownload({ publicId: 'lessons/lesson/file' });

  assert.deepEqual(request, {
    publicId: 'lessons/lesson/file.pdf',
    format: 'pdf',
    options: {
      cloud_name: 'example-cloud',
      api_key: 'api-key',
      api_secret: 'api-secret',
      secure: true,
      timestamp: 1790762400,
      resource_type: 'raw',
      type: 'authenticated',
      expires_at: 1790762460,
      attachment: true,
    },
  });
  assert.equal(result.expiresAt.toISOString(), '2026-09-30T10:01:00.000Z');
  const repeated = provider.createPrivateDownload({ publicId: 'lessons/lesson/file.pdf' });
  assert.equal(request.publicId, 'lessons/lesson/file.pdf');
  assert.equal(repeated.url, result.url);
});

test('Cloudinary inspection and deletion use fixed account and resource settings', async () => {
  const calls = [];
  const provider = createCloudinaryMediaProvider({
    cloudName: 'contract-cloud', apiKey: 'contract-key', apiSecret: 'contract-secret',
    imageUploadPreset: 'images', attachmentUploadPreset: 'attachments',
    cloudinaryClient: {
      api: { resource: async (publicId, options) => {
        calls.push({ action: 'inspect', publicId, options });
        return { public_id: publicId, bytes: 1024 };
      } },
      uploader: { destroy: async (publicId, options) => {
        calls.push({ action: 'delete', publicId, options });
        return { result: 'ok' };
      } },
    },
  });
  const resource = {
    publicId: 'elearn/lesson_attachment/owner/asset',
    resourceType: 'raw', deliveryType: 'authenticated',
  };
  assert.equal((await provider.inspectUpload(resource)).bytes, 1024);
  await provider.deleteUpload(resource);
  assert.deepEqual(calls.map(call => call.action), ['inspect', 'delete']);
  for (const call of calls) {
    assert.equal(call.publicId, `${resource.publicId}.pdf`);
    assert.equal(call.options.cloud_name, 'contract-cloud');
    assert.equal(call.options.api_key, 'contract-key');
    assert.equal(call.options.api_secret, 'contract-secret');
    assert.equal(call.options.resource_type, 'raw');
    assert.equal(call.options.type, 'authenticated');
  }
  assert.equal(calls[1].options.invalidate, true);
});

test('Cloudinary inspection recognizes both SDK not-found shapes and sanitizes other errors', async () => {
  for (const error of [{ http_code: 404 }, { error: { http_code: 404 } },
    { error: { http_code: 500, message: 'private details' } }]) {
    const provider = createCloudinaryMediaProvider({
      cloudName: 'test-cloud', apiKey: 'key', apiSecret: 'secret',
      imageUploadPreset: 'images', attachmentUploadPreset: 'attachments',
      cloudinaryClient: { api: { resource: async () => { throw error; } } },
    });
    const resource = { publicId: 'lesson/file.pdf', resourceType: 'raw',
      deliveryType: 'authenticated' };
    if ((error.http_code ?? error.error?.http_code) === 404) {
      assert.equal(await provider.inspectUpload(resource), null);
    } else {
      await assert.rejects(provider.inspectUpload(resource),
        failure => failure.code === 'MEDIA_PROVIDER_UNAVAILABLE'
          && !failure.message.includes('private details'));
    }
  }
});

test('Mux reuses or creates only signed playback IDs', async () => {
  let createCalls = 0;
  const assets = {
    existing: { status: 'ready', playback_ids: [{ id: 'signed-existing', policy: 'signed' }] },
    new: { status: 'ready', playback_ids: [{ id: 'public-id', policy: 'public' }] },
  };
  const provider = createMuxVideoProvider({
    tokenId: 'token-id',
    tokenSecret: 'token-secret',
    muxClient: {
      video: {
        assets: {
          retrieve: async assetId => assets[assetId],
          createPlaybackId: async (_assetId, body) => {
            createCalls += 1;
            assert.deepEqual(body, { policy: 'signed' });
            const playback = { id: 'signed-created', policy: 'signed' };
            assets.new.playback_ids.push(playback);
            return playback;
          },
          deletePlaybackId: async (assetId, id) => {
            assets[assetId].playback_ids = assets[assetId].playback_ids.filter(value => value.id !== id);
          },
        },
      },
    },
  });

  assert.equal(await provider.ensureSignedPlaybackId({ assetId: 'existing' }), 'signed-existing');
  assert.equal(await provider.ensureSignedPlaybackId({ assetId: 'new' }), 'signed-created');
  assert.equal(createCalls, 1);
  assert.deepEqual(assets.new.playback_ids, [{ id: 'signed-created', policy: 'signed' }]);
});

test('Cloudinary deletion cancels its isolated request and rejects with the abort reason', async () => {
  const controller = new AbortController();
  let entered;
  let destroyed = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const provider = createCloudinaryMediaProvider({
    cloudName: 'contract-cloud', apiKey: 'contract-key', apiSecret: 'contract-secret',
    imageUploadPreset: 'images', attachmentUploadPreset: 'attachments',
    cloudinaryClient: { uploader: { destroy: (_id, options) => {
      assert.equal(options.timeout, 10_000);
      const originalDestroy = options.agent.destroy.bind(options.agent);
      options.agent.destroy = () => { destroyed += 1; originalDestroy(); };
      entered();
      return new Promise(() => {});
    } } },
  });
  const deletion = provider.deleteUpload({ publicId: 'review/asset', resourceType: 'raw',
    deliveryType: 'authenticated', signal: controller.signal });
  const rejected = assert.rejects(deletion, error => error === controller.signal.reason);
  await started;
  controller.abort();
  await rejected;
  assert.ok(destroyed >= 1);
});

test('Cloudinary deletion does not dispatch an already cancelled request', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const provider = createCloudinaryMediaProvider({
    cloudName: 'contract-cloud', apiKey: 'contract-key', apiSecret: 'contract-secret',
    imageUploadPreset: 'images', attachmentUploadPreset: 'attachments',
    cloudinaryClient: { uploader: { destroy: async () => { calls += 1; } } },
  });
  await assert.rejects(provider.deleteUpload({ publicId: 'review/asset', resourceType: 'raw',
    deliveryType: 'authenticated', signal: controller.signal }),
  error => error === controller.signal.reason);
  assert.equal(calls, 0);
});

test('Mux signs playback tokens with the configured key and fixed lifetime', async () => {
  let request;
  const token = `e30.${Buffer.from(JSON.stringify({ sub: 'playback-id', aud: 'v',
    kid: 'signing-key-id', exp: Math.floor(now.getTime() / 1000) + 900 })).toString('base64url')}.signature`;
  const provider = createMuxVideoProvider({
    signingKeyId: 'signing-key-id',
    signingPrivateKey: 'private-key',
    playbackTokenTtlSeconds: 900,
    clock: () => now,
    muxClient: {
      jwt: {
        signPlaybackId: async (playbackId, options) => {
          request = { playbackId, options };
          return token;
        },
      },
    },
  });

  const result = await provider.signPlaybackToken('playback-id');

  assert.deepEqual(request, {
    playbackId: 'playback-id',
    options: {
      type: 'video',
      expiration: '900s',
      keyId: 'signing-key-id',
      keySecret: 'private-key',
    },
  });
  assert.equal(result.token, token);
  assert.equal(result.expiresAt.toISOString(), '2026-09-30T10:15:00.000Z');
});

test('Stripe creates EGP Test Mode Checkout with server-owned metadata and idempotency', async () => {
  let request;
  const provider = createStripePaymentProvider({
    secretKey: 'sk_test_example',
    webhookSecret: 'whsec_example',
    successUrl: 'https://app.example.test/checkout/success',
    cancelUrl: 'https://app.example.test/checkout/cancel',
    stripeClient: {
      checkout: {
        sessions: {
          create: async (body, options) => {
            request = { body, options };
            return {
              id: 'cs_test_example',
              livemode: false,
              url: 'https://checkout.stripe.com/c/pay/cs_test_example',
              expires_at: 1790764200,
              mode: 'payment', status: 'open', payment_status: 'unpaid', currency: 'egp',
              amount_total: body.line_items[0].price_data.unit_amount,
              client_reference_id: body.client_reference_id, metadata: body.metadata,
            };
          },
        },
      },
      webhooks: { constructEvent: () => ({}) },
    },
  });

  const result = await provider.createCheckoutSession({
    orderId: 'order-id',
    courseTitle: 'Clean Backend Architecture',
    amountMinor: 25000,
    customerEmail: 'student@example.test',
    idempotencyKey: 'checkout:order-id',
    expiresAtSeconds: 1790764200,
  });

  assert.equal(request.body.line_items[0].price_data.currency, 'egp');
  assert.equal(request.body.line_items[0].price_data.unit_amount, 25000);
  assert.deepEqual(request.body.metadata, { orderId: 'order-id' });
  assert.deepEqual(request.body.payment_intent_data.metadata, { orderId: 'order-id' });
  assert.equal(request.body.success_url,
    'https://app.example.test/checkout/success?session_id={CHECKOUT_SESSION_ID}');
  assert.deepEqual(request.options, { idempotencyKey: 'checkout:order-id' });
  assert.equal(result.id, 'cs_test_example');
  assert.equal(result.expiresAt.toISOString(), '2026-09-30T10:30:00.000Z');
});

test('Stripe verifies the untouched raw webhook body and normalizes signature failures', () => {
  const rawBody = Buffer.from('{"id":"evt_test"}');
  let request;
  const provider = createStripePaymentProvider({
    secretKey: 'sk_test_example',
    webhookSecret: 'whsec_example',
    successUrl: 'https://app.example.test/checkout/success',
    cancelUrl: 'https://app.example.test/checkout/cancel',
    stripeClient: {
      checkout: { sessions: {} },
      webhooks: {
        constructEvent(body, signature, secret, tolerance) {
          request = { body, signature, secret, tolerance };
          if (signature === 'invalid') throw new Error('provider details');
          return { id: 'evt_test' };
        },
      },
    },
  });

  assert.deepEqual(provider.unwrapWebhook({ rawBody, signature: 'valid' }), { id: 'evt_test' });
  assert.strictEqual(request.body, rawBody);
  assert.equal(request.secret, 'whsec_example');
  assert.equal(request.tolerance, 300);
  assert.throws(
    () => provider.unwrapWebhook({ rawBody, signature: 'invalid' }),
    error => error.code === 'INVALID_PAYMENT_WEBHOOK_SIGNATURE'
      && !error.message.includes('provider details'),
  );
});

test('Stripe retry after an uncertain response reuses the persisted request across instances', async () => {
  const requests = [];
  const stripeClient = { checkout: { sessions: { create: async (body, options) => {
    requests.push(structuredClone({ body, options }));
    if (requests.length === 1) throw new Error('Response lost after creation');
    return { id: 'cs_test_retry', livemode: false, url: 'https://checkout.stripe.com/retry',
      mode: 'payment', status: 'open', payment_status: 'unpaid', currency: 'egp',
      amount_total: body.line_items[0].price_data.unit_amount, expires_at: body.expires_at,
      client_reference_id: body.client_reference_id, metadata: body.metadata };
  } } } };
  const configuration = {
    secretKey: 'sk_test_example', webhookSecret: 'whsec_example',
    successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel',
    stripeClient,
  };
  const snapshot = {
    orderId: 'retry-order', courseTitle: 'Course', amountMinor: 1000,
    customerEmail: 'student@example.test', idempotencyKey: 'checkout:retry-order',
    expiresAtSeconds: 1790764200,
  };
  await assert.rejects(createStripePaymentProvider(configuration).createCheckoutSession(snapshot),
    error => error.code === 'PAYMENT_PROVIDER_UNAVAILABLE');
  const restartedProvider = createStripePaymentProvider(configuration);
  await restartedProvider.createCheckoutSession(structuredClone(snapshot));
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[1].body.expires_at, snapshot.expiresAtSeconds);
  for (const expiresAtSeconds of [undefined, null, NaN, Infinity, -1, 1.5, 8640000000001]) {
    await assert.rejects(restartedProvider.createCheckoutSession({ ...snapshot, expiresAtSeconds }),
      /persisted Checkout expiry/);
  }
  assert.equal(requests.length, 2);
});

test('Cloudinary provider instances keep download accounts and signatures isolated', () => {
  const make = (cloudName, apiKey, apiSecret) => createCloudinaryMediaProvider({
    cloudName, apiKey, apiSecret, imageUploadPreset: 'images',
    attachmentUploadPreset: 'attachments', clock: () => now,
  });
  const first = make('account-a', 'key-a', 'secret-a');
  const before = first.createPrivateDownload({ publicId: 'lesson/file' });
  const second = make('account-b', 'key-b', 'secret-b');
  const secondUrl = new URL(second.createPrivateDownload({ publicId: 'lesson/file' }).url);
  const after = first.createPrivateDownload({ publicId: 'lesson/file' });
  const firstUrl = new URL(after.url);
  assert.equal(after.url, before.url);
  assert.match(firstUrl.pathname, /\/account-a\/raw\/download$/);
  assert.equal(firstUrl.searchParams.get('api_key'), 'key-a');
  assert.match(secondUrl.pathname, /\/account-b\/raw\/download$/);
  assert.equal(secondUrl.searchParams.get('api_key'), 'key-b');
  assert.notEqual(firstUrl.searchParams.get('signature'), secondUrl.searchParams.get('signature'));
  assert.equal(firstUrl.searchParams.has('api_secret'), false);
});

const checkoutSessionFixture = overrides => ({
  id: 'cs_test_lookup', livemode: false, mode: 'payment', status: 'expired',
  payment_status: 'unpaid', payment_intent: { id: 'pi_cancelled', status: 'canceled' },
  amount_total: 1000, currency: 'egp', client_reference_id: 'lookup-order',
  metadata: { orderId: 'lookup-order' }, expires_at: 1790764200, url: null,
  ...overrides,
});
const lookupProvider = sessions => createStripePaymentProvider({
  secretKey: 'sk_test_lookup', webhookSecret: 'whsec_lookup',
  successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel',
  stripeClient: { checkout: { sessions } },
});

test('Stripe retrieval expands intent state and preserves expired session evidence', async () => {
  let options;
  const provider = lookupProvider({ retrieve: async (_id, input) => {
    options = input;
    return checkoutSessionFixture();
  } });
  const result = await provider.retrieveCheckoutSession('cs_test_lookup');
  assert.deepEqual(options, { expand: ['payment_intent'] });
  assert.equal(result.paymentIntentStatus, 'canceled');
  assert.equal(result.status, 'expired');
  assert.equal(result.url, null);
  assert.equal(result.orderId, 'lookup-order');
});

test('historical checkout lookup exhausts pagination and rejects ambiguous matches', async () => {
  const calls = [];
  let duplicate = false;
  const provider = lookupProvider({ list: async params => {
    calls.push(params);
    if (!params.starting_after) {
      return { data: [checkoutSessionFixture()], has_more: true };
    }
    return { data: [checkoutSessionFixture({ id: 'cs_other',
      client_reference_id: duplicate ? 'lookup-order' : 'other-order',
      metadata: { orderId: duplicate ? 'lookup-order' : 'other-order' } })], has_more: false };
  } });
  const filter = { orderId: 'lookup-order', createdAfter: 1000, createdBefore: 2000 };
  assert.equal((await provider.findCheckoutSession(filter)).id, 'cs_test_lookup');
  assert.deepEqual(calls[0].created, { gte: 1000, lte: 2000 });
  assert.equal(calls[1].starting_after, 'cs_test_lookup');
  duplicate = true;
  await assert.rejects(provider.findCheckoutSession(filter),
    error => error.code === 'PAYMENT_PROVIDER_UNAVAILABLE');
});

test('incomplete lookup and malformed provider sessions fail closed', async () => {
  let pages = 0;
  const provider = lookupProvider({ list: async () => {
    pages += 1;
    return { data: [checkoutSessionFixture({ id: `cs_page_${pages}`,
      client_reference_id: 'unrelated', metadata: { orderId: 'unrelated' } })], has_more: true };
  } });
  await assert.rejects(provider.findCheckoutSession({ orderId: 'lookup-order',
    createdAfter: 1000, createdBefore: 2000 }), error => error.code === 'PAYMENT_PROVIDER_UNAVAILABLE');
  assert.equal(pages, 20);
  for (const override of [{ livemode: true }, { amount_total: null }, { expires_at: Infinity },
    { expires_at: -1 }, { expires_at: 8640000000001 }, { id: '' }]) {
    const invalid = lookupProvider({ retrieve: async () => checkoutSessionFixture(override) });
    await assert.rejects(invalid.retrieveCheckoutSession('cs_test_lookup'),
      error => error.code === 'PAYMENT_PROVIDER_UNAVAILABLE');
  }
});

test('provider failures expose stable safe errors without provider internals', async () => {
  const stripe = createStripePaymentProvider({
    secretKey: 'sk_test_example',
    webhookSecret: 'whsec_example',
    successUrl: 'https://app.example.test/success',
    cancelUrl: 'https://app.example.test/cancel',
    stripeClient: {
      checkout: { sessions: { create: async () => { throw new Error('secret provider error'); } } },
      webhooks: {},
    },
  });

  await assert.rejects(
    stripe.createCheckoutSession({
      orderId: 'order-id', courseTitle: 'Course', amountMinor: 100,
      customerEmail: 'student@example.test', idempotencyKey: 'key',
      expiresAtSeconds: 1790764200,
    }),
    error => error.code === 'PAYMENT_PROVIDER_UNAVAILABLE'
      && !error.message.includes('secret provider error'),
  );
});

test('official Cloudinary SDK produces usable signatures and authenticated download URLs', () => {
  const provider = createCloudinaryMediaProvider({
    cloudName: 'contract-cloud',
    apiKey: 'contract-key',
    apiSecret: 'contract-secret',
    imageUploadPreset: 'signed-images',
    attachmentUploadPreset: 'signed-attachments',
    clock: () => new Date(),
  });

  const upload = provider.createSignedUpload({
    publicId: 'contract/image', purpose: 'course_cover',
  });
  const download = provider.createPrivateDownload({ publicId: 'contract/attachment' });
  const downloadUrl = new URL(download.url);

  assert.match(upload.signature, /^[a-f\d]{40}$/);
  assert.equal(downloadUrl.protocol, 'https:');
  assert.equal(downloadUrl.searchParams.get('type'), 'authenticated');
  assert.equal(downloadUrl.searchParams.get('format'), 'pdf');
  assert.equal(downloadUrl.searchParams.get('attachment'), 'true');
  assert.match(downloadUrl.searchParams.get('signature'), /^[a-f\d]{40}$/);
});

test('official Mux SDK signs an RS256 video JWT with the configured claims', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signingPrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const beforeSeconds = Math.floor(Date.now() / 1000);
  const provider = createMuxVideoProvider({
    signingKeyId: 'contract-signing-key',
    signingPrivateKey,
    playbackTokenTtlSeconds: 900,
    muxClient: new Mux(),
  });

  const { token, expiresAt } = await provider.signPlaybackToken('contract-playback-id');
  const header = decodeProtectedHeader(token);
  const claims = decodeJwt(token);

  assert.equal(header.alg, 'RS256');
  assert.equal(claims.kid, 'contract-signing-key');
  assert.equal(claims.sub, 'contract-playback-id');
  assert.equal(claims.aud, 'v');
  assert.ok(claims.exp >= beforeSeconds + 899 && claims.exp <= beforeSeconds + 901);
  assert.equal(expiresAt.getTime(), claims.exp * 1000);
  const key = await importSPKI(publicKey.export({ type: 'spki', format: 'pem' }), 'RS256');
  await jwtVerify(token, key, { algorithms: ['RS256'], audience: 'v', subject: 'contract-playback-id' });
});

test('Mux resumes a partially failed public-ID removal without allocating another signed ID', async () => {
  const asset = { status: 'ready', playback_ids: [{ id: 'public-1', policy: 'public' },
    { id: 'public-2', policy: 'public' }] };
  let creates = 0; let failOnce = true;
  const provider = createMuxVideoProvider({ tokenId: 'id', tokenSecret: 'secret', muxClient: {
    video: { assets: {
      async retrieve() { return structuredClone(asset); },
      async createPlaybackId() {
        creates += 1; const value = { id: 'signed', policy: 'signed' };
        asset.playback_ids.push(value); return value;
      },
      async deletePlaybackId(_assetId, id) {
        if (id === 'public-2' && failOnce) { failOnce = false; throw new Error('private provider failure'); }
        asset.playback_ids = asset.playback_ids.filter(value => value.id !== id);
      },
    } },
  } });
  await assert.rejects(provider.ensureSignedPlaybackId({ assetId: 'asset' }),
    error => error.code === 'VIDEO_PROVIDER_UNAVAILABLE' && !error.message.includes('private'));
  assert.equal(await provider.ensureSignedPlaybackId({ assetId: 'asset' }), 'signed');
  assert.equal(creates, 1); assert.deepEqual(asset.playback_ids, [{ id: 'signed', policy: 'signed' }]);
});

test('Mux refuses issuance if a public policy remains after deletion', async () => {
  const provider = createMuxVideoProvider({ tokenId: 'id', tokenSecret: 'secret', muxClient: {
    video: { assets: {
      async retrieve() { return { status: 'ready', playback_ids: [
        { id: 'signed', policy: 'signed' }, { id: 'public', policy: 'public' }] }; },
      async deletePlaybackId() {},
    } },
  } });
  await assert.rejects(provider.ensureSignedPlaybackId({ assetId: 'asset' }),
    error => error.code === 'VIDEO_PROVIDER_UNAVAILABLE');
});

test('Mux maps missing/errored assets safely and rejects another lesson metadata before mutation', async () => {
  let mode = 'missing'; let writes = 0;
  const provider = createMuxVideoProvider({ tokenId: 'id', tokenSecret: 'secret', muxClient: {
    video: { assets: {
      async retrieve() {
        if (mode === 'missing') throw Object.assign(new Error('private asset details'), { status: 404 });
        if (mode === 'errored') return { status: 'errored' };
        return { status: 'ready', meta: { external_id: 'another-lesson' }, playback_ids: [] };
      },
      async createPlaybackId() { writes += 1; }, async deletePlaybackId() { writes += 1; },
    } },
  } });
  for (mode of ['missing', 'errored']) {
    await assert.rejects(provider.ensureSignedPlaybackId({ assetId: 'asset' }),
      error => error.code === 'VIDEO_ASSET_UNAVAILABLE' && !error.message.includes('private'));
  }
  mode = 'foreign';
  await assert.rejects(provider.ensureSignedPlaybackId({ assetId: 'asset', lessonId: 'own-lesson' }),
    error => error.code === 'VIDEO_PROVIDER_UNAVAILABLE');
  assert.equal(writes, 0);
});

test('Mux canceled migration does not dispatch any remote work', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const provider = createMuxVideoProvider({ tokenId: 'id', tokenSecret: 'secret', muxClient: {
    video: { assets: { async retrieve() { calls += 1; } } },
  } });
  await assert.rejects(provider.ensureSignedPlaybackId({ assetId: 'asset', signal: controller.signal }));
  assert.equal(calls, 0);
});

test('Mux refuses malformed or overlong-lived playback JWTs', async () => {
  for (const token of ['not-a-jwt', `e30.${Buffer.from(JSON.stringify({ sub: 'asset', aud: 'v',
    kid: 'key', exp: Math.floor(now.getTime() / 1000) + 3600 })).toString('base64url')}.signature`]) {
    const provider = createMuxVideoProvider({ signingKeyId: 'key', signingPrivateKey: 'private',
      clock: () => now, muxClient: { jwt: { async signPlaybackId() { return token; } } } });
    await assert.rejects(provider.signPlaybackToken('asset'), error => error.code === 'VIDEO_PROVIDER_UNAVAILABLE');
  }
});

test('official Stripe SDK accepts a generated Test webhook signature over raw bytes', () => {
  const stripe = new Stripe('sk_test_contract');
  const webhookSecret = 'whsec_contract_secret';
  const payload = JSON.stringify({ id: 'evt_contract', type: 'checkout.session.completed' });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const provider = createStripePaymentProvider({
    secretKey: 'sk_test_contract',
    webhookSecret,
    successUrl: 'https://app.example.test/checkout/success',
    cancelUrl: 'https://app.example.test/checkout/cancel',
    stripeClient: stripe,
  });

  const event = provider.unwrapWebhook({ rawBody: Buffer.from(payload), signature });

  assert.equal(event.id, 'evt_contract');
  assert.equal(event.type, 'checkout.session.completed');
});

test('live provider proof refuses to contact providers without explicit execution consent', () => {
  const result = spawnSync(process.execPath, [liveProofScript], {
    encoding: 'utf8',
    env: { ...process.env },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Re-run with --execute/);
  assert.equal(result.stdout, '');
});
