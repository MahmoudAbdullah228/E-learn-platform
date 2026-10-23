import Mux from '@mux/mux-node';
import { decodeJwt } from 'jose';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function unavailable() {
  return new ApiError(503, 'VIDEO_PROVIDER_UNAVAILABLE',
    'Video services are temporarily unavailable');
}

function invalidSignature() {
  return new ApiError(400, 'INVALID_VIDEO_WEBHOOK_SIGNATURE',
    'The video webhook signature is invalid');
}

function isMissingProviderResource(error) {
  return error?.status === 404 || error?.statusCode === 404;
}

function assertCurrentSignature(headers, clock) {
  const header = headers?.['mux-signature'];
  if (typeof header !== 'string') throw invalidSignature();
  const timestamps = header.split(',').filter(part => part.startsWith('t='));
  if (timestamps.length !== 1 || !/^t=\d+$/.test(timestamps[0])) throw invalidSignature();
  const timestamp = Number(timestamps[0].slice(2));
  const ageSeconds = Math.abs(Math.floor(clock().getTime() / 1000) - timestamp);
  if (!Number.isSafeInteger(timestamp) || ageSeconds > 300) throw invalidSignature();
}

export function createMuxVideoProvider({
  tokenId = env.MUX_TOKEN_ID,
  tokenSecret = env.MUX_TOKEN_SECRET,
  webhookSecret = env.MUX_WEBHOOK_SECRET,
  signingKeyId = env.MUX_SIGNING_KEY_ID,
  signingPrivateKey = env.MUX_SIGNING_PRIVATE_KEY,
  playbackTokenTtlSeconds = env.MUX_PLAYBACK_TOKEN_TTL_SECONDS,
  uploadOrigin = env.MUX_UPLOAD_CORS_ORIGIN,
  uploadTimeoutSeconds = env.MUX_UPLOAD_TIMEOUT_SECONDS,
  videoQuality = env.MUX_VIDEO_QUALITY,
  testMode = env.MUX_TEST_MODE,
  clock = () => new Date(),
  muxClient,
} = {}) {
  const mux = muxClient ?? new Mux({ tokenId, tokenSecret, webhookSecret, timeout: 10_000, maxRetries: 0 });

  return Object.freeze({
    async createDirectUpload({ lessonId, attemptId }) {
      if (!tokenId || !tokenSecret) throw unavailable();
      let upload;
      try {
        upload = await mux.video.uploads.create({
          cors_origin: uploadOrigin,
          timeout: uploadTimeoutSeconds,
          test: testMode,
          new_asset_settings: {
            playback_policies: ['signed'],
            passthrough: attemptId,
            meta: { external_id: lessonId },
            video_quality: videoQuality,
          },
        });
      } catch {
        throw unavailable();
      }
      if (typeof upload?.id !== 'string' || typeof upload?.url !== 'string'
          || !URL.canParse(upload.url) || new URL(upload.url).protocol !== 'https:'
          || !Number.isSafeInteger(upload.timeout) || upload.timeout < 60
          || upload.timeout > 604_800) {
        if (typeof upload?.id === 'string') {
          try {
            await mux.video.uploads.cancel(upload.id);
          } catch {
            // Invalid provider responses are still surfaced as a safe availability error.
          }
        }
        throw unavailable();
      }
      return {
        id: upload.id,
        url: upload.url,
        timeoutSeconds: upload.timeout,
      };
    },

    async cancelDirectUpload(uploadId) {
      if (!tokenId || !tokenSecret || !uploadId) return;
      try {
        await mux.video.uploads.cancel(uploadId);
      } catch {
        // Best effort only: an unreturned URL cannot be used by the client.
      }
    },

    async cleanupResource({ resourceType, resourceId, signal }) {
      if (!tokenId || !tokenSecret) throw unavailable();
      try {
        if (resourceType === 'asset') {
          await mux.video.assets.delete(resourceId, { signal });
          return;
        }
        if (resourceType !== 'upload') throw new TypeError('Unsupported video resource type');
        const upload = await mux.video.uploads.retrieve(resourceId, { signal });
        if (upload?.asset_id) {
          await mux.video.assets.delete(upload.asset_id, { signal });
        } else if (!['cancelled', 'timed_out'].includes(upload?.status)) {
          await mux.video.uploads.cancel(resourceId, { signal });
        }
      } catch (error) {
        if (isMissingProviderResource(error)) return;
        throw unavailable();
      }
    },

    async ensureSignedPlaybackId({ assetId, lessonId, signal }) {
      if (!tokenId || !tokenSecret) throw unavailable();
      try {
        signal?.throwIfAborted();
        const asset = await mux.video.assets.retrieve(assetId, { signal });
        signal?.throwIfAborted();
        if (asset?.status !== 'ready') {
          if (asset?.status === 'errored' || asset?.status === 'deleted') {
            throw new ApiError(409, 'VIDEO_ASSET_UNAVAILABLE', 'The lesson video must be uploaded again');
          }
          throw unavailable();
        }
        if (!Array.isArray(asset.playback_ids)
            || (lessonId && asset.meta?.external_id && asset.meta.external_id !== lessonId)) {
          throw unavailable();
        }
        const existing = asset?.playback_ids?.find(playback => playback.policy === 'signed');
        const playback = existing ?? await mux.video.assets.createPlaybackId(
          assetId,
          { policy: 'signed' },
          { signal },
        );
        if (typeof playback?.id !== 'string' || playback.id.length === 0
            || playback.policy !== 'signed') {
          throw unavailable();
        }
        // A signed ID does not disable an older public ID. Remove all public alternatives.
        for (const publicPlayback of asset.playback_ids.filter(value => value.policy === 'public')) {
          signal?.throwIfAborted();
          if (typeof publicPlayback.id !== 'string' || !publicPlayback.id) throw unavailable();
          try {
            await mux.video.assets.deletePlaybackId(assetId, publicPlayback.id, { signal });
          } catch (error) {
            if (!isMissingProviderResource(error)) throw error;
          }
        }
        signal?.throwIfAborted();
        const confirmed = await mux.video.assets.retrieve(assetId, { signal });
        signal?.throwIfAborted();
        if (confirmed?.status !== 'ready' || !Array.isArray(confirmed.playback_ids)
            || confirmed.playback_ids.some(value => value.policy !== 'signed')
            || !confirmed.playback_ids.some(value => value.id === playback.id && value.policy === 'signed')) {
          throw unavailable();
        }
        return playback.id;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isMissingProviderResource(error)) {
          throw new ApiError(409, 'VIDEO_ASSET_UNAVAILABLE', 'The lesson video must be uploaded again');
        }
        throw unavailable();
      }
    },

    async signPlaybackToken(playbackId) {
      if (!signingKeyId || !signingPrivateKey || typeof playbackId !== 'string'
          || playbackId.length === 0) {
        throw unavailable();
      }
      try {
        const token = await mux.jwt.signPlaybackId(playbackId, {
          type: 'video',
          expiration: `${playbackTokenTtlSeconds}s`,
          keyId: signingKeyId,
          keySecret: signingPrivateKey,
        });
        if (typeof token !== 'string' || token.length === 0) throw unavailable();
        const claims = decodeJwt(token);
        const nowSeconds = Math.floor(clock().getTime() / 1000);
        if (claims.sub !== playbackId || claims.aud !== 'v' || claims.kid !== signingKeyId
            || !Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds
            || claims.exp > nowSeconds + playbackTokenTtlSeconds + 1) throw unavailable();
        return {
          token,
          expiresAt: new Date(claims.exp * 1000),
        };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw unavailable();
      }
    },

    async unwrapWebhook({ rawBody, headers }) {
      if (!webhookSecret || !Buffer.isBuffer(rawBody)) throw invalidSignature();
      assertCurrentSignature(headers, clock);
      try {
        return await mux.webhooks.unwrap(rawBody.toString('utf8'), headers, webhookSecret);
      } catch {
        throw invalidSignature();
      }
    },
  });
}

export const muxVideoProvider = createMuxVideoProvider();
