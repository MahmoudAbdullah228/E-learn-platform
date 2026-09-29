import Mux from '@mux/mux-node';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function unavailable() {
  return new ApiError(503, 'VIDEO_PROVIDER_UNAVAILABLE',
    'Video uploads are temporarily unavailable');
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
  uploadOrigin = env.MUX_UPLOAD_CORS_ORIGIN,
  uploadTimeoutSeconds = env.MUX_UPLOAD_TIMEOUT_SECONDS,
  videoQuality = env.MUX_VIDEO_QUALITY,
  testMode = env.MUX_TEST_MODE,
  clock = () => new Date(),
  muxClient,
} = {}) {
  const mux = muxClient ?? new Mux({ tokenId, tokenSecret, webhookSecret });

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
