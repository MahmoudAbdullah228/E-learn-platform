import { Agent } from 'node:https';

import { v2 as cloudinary } from 'cloudinary';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { cloudinaryPublicId } from '../utils/cloudinaryPublicId.js';

const PURPOSES = Object.freeze({
  avatar: Object.freeze({ resourceType: 'image', deliveryType: 'upload', preset: 'image' }),
  course_cover: Object.freeze({ resourceType: 'image', deliveryType: 'upload', preset: 'image' }),
  lesson_attachment: Object.freeze({
    resourceType: 'raw', deliveryType: 'authenticated', preset: 'attachment',
  }),
});

function unavailable() {
  return new ApiError(503, 'MEDIA_PROVIDER_UNAVAILABLE',
    'Media uploads are temporarily unavailable');
}

function assertHttpsUrl(value) {
  if (typeof value !== 'string' || !URL.canParse(value) || new URL(value).protocol !== 'https:') {
    throw unavailable();
  }
}

export function createCloudinaryMediaProvider({
  cloudName = env.CLOUDINARY_CLOUD_NAME,
  apiKey = env.CLOUDINARY_API_KEY,
  apiSecret = env.CLOUDINARY_API_SECRET,
  imageUploadPreset = env.CLOUDINARY_IMAGE_UPLOAD_PRESET,
  attachmentUploadPreset = env.CLOUDINARY_ATTACHMENT_UPLOAD_PRESET,
  uploadIntentTtlSeconds = env.CLOUDINARY_UPLOAD_INTENT_TTL_SECONDS,
  downloadUrlTtlSeconds = env.CLOUDINARY_DOWNLOAD_URL_TTL_SECONDS,
  clock = () => new Date(),
  cloudinaryClient,
} = {}) {
  const client = cloudinaryClient ?? cloudinary;
  const configured = Boolean(cloudName && apiKey && apiSecret
    && imageUploadPreset && attachmentUploadPreset);

  return Object.freeze({
    publicImageUrl({ publicId, format }) {
      if (!configured) return null;
      publicId = cloudinaryPublicId(publicId, 'image');
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(format)) return null;
      return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}`
        + `/image/upload/${publicId}.${format}`;
    },

    async inspectUpload({ publicId, resourceType, deliveryType }) {
      if (!configured) throw unavailable();
      publicId = cloudinaryPublicId(publicId, resourceType);
      try {
        return await client.api.resource(publicId, {
          cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret,
          resource_type: resourceType, type: deliveryType,
        });
      } catch (error) {
        if ((error?.http_code ?? error?.error?.http_code) === 404) return null;
        throw unavailable();
      }
    },

    async deleteUpload({ publicId, resourceType, deliveryType, signal }) {
      signal?.throwIfAborted();
      if (!configured) throw unavailable();
      publicId = cloudinaryPublicId(publicId, resourceType);
      // Isolate this operation's sockets so cancellation cannot affect another request.
      const agent = new Agent();
      let deadline;
      let onAbort;
      try {
        const result = await new Promise((resolve, reject) => {
          onAbort = () => { agent.destroy(); reject(signal.reason); };
          signal?.addEventListener('abort', onAbort, { once: true });
          deadline = setTimeout(() => {
            agent.destroy();
            reject(unavailable());
          }, 10_000);
          Promise.resolve().then(() => {
            signal?.throwIfAborted();
            return client.uploader.destroy(publicId, {
              cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret,
              resource_type: resourceType, type: deliveryType, invalidate: true,
              agent, timeout: 10_000,
            });
          }).then(resolve, reject);
        });
        signal?.throwIfAborted();
        if (!['ok', 'not found'].includes(result?.result)) throw unavailable();
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (error instanceof ApiError) throw error;
        throw unavailable();
      } finally {
        clearTimeout(deadline);
        signal?.removeEventListener('abort', onAbort);
        agent.destroy();
      }
    },
    createSignedUpload({ publicId, purpose }) {
      if (!configured) throw unavailable();
      const purposeConfiguration = PURPOSES[purpose];
      if (!purposeConfiguration) throw new TypeError('Unsupported media purpose');
      publicId = cloudinaryPublicId(publicId, purposeConfiguration.resourceType);

      const timestamp = Math.floor(clock().getTime() / 1000);
      const uploadPreset = purposeConfiguration.preset === 'image'
        ? imageUploadPreset
        : attachmentUploadPreset;
      const parameters = {
        public_id: publicId,
        timestamp,
        type: purposeConfiguration.deliveryType,
        upload_preset: uploadPreset,
        overwrite: false,
      };

      let signature;
      try {
        signature = client.utils.api_sign_request(parameters, apiSecret);
      } catch {
        throw unavailable();
      }
      if (typeof signature !== 'string' || signature.length === 0) throw unavailable();

      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}`
          + `/${purposeConfiguration.resourceType}/upload`,
        apiKey,
        signature,
        parameters,
        resourceType: purposeConfiguration.resourceType,
        deliveryType: purposeConfiguration.deliveryType,
        expiresAt: new Date((timestamp + uploadIntentTtlSeconds) * 1000),
        providerUploadValidUntil: new Date((timestamp + 3600) * 1000),
      };
    },

    createPrivateDownload({ publicId, format = 'pdf' }) {
      if (!configured) throw unavailable();
      publicId = cloudinaryPublicId(publicId, 'raw');
      if (format !== 'pdf') throw new TypeError('Only PDF attachments are supported');

      const timestamp = Math.floor(clock().getTime() / 1000);
      const expiresAtSeconds = timestamp + downloadUrlTtlSeconds;
      let url;
      try {
        url = client.utils.private_download_url(publicId, format, {
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          secure: true,
          timestamp,
          resource_type: 'raw',
          type: 'authenticated',
          expires_at: expiresAtSeconds,
          attachment: true,
        });
      } catch {
        throw unavailable();
      }
      assertHttpsUrl(url);
      return { url, expiresAt: new Date(expiresAtSeconds * 1000) };
    },
  });
}

export const cloudinaryMediaProvider = createCloudinaryMediaProvider();
