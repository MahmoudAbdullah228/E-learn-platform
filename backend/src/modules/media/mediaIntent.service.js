import { randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { ApiError } from '../../utils/ApiError.js';
import { cloudinaryPublicId } from '../../utils/cloudinaryPublicId.js';

const purposeSettings = Object.freeze({
  avatar: { resourceType: 'image', deliveryType: 'upload', maxBytes: () => env.CLOUDINARY_MAX_IMAGE_BYTES },
  course_cover: { resourceType: 'image', deliveryType: 'upload', maxBytes: () => env.CLOUDINARY_MAX_IMAGE_BYTES },
  lesson_attachment: { resourceType: 'raw', deliveryType: 'authenticated', maxBytes: () => env.CLOUDINARY_MAX_ATTACHMENT_BYTES },
});

export async function issueMediaIntent({ ownerId, input, revisionId = null, session, provider, clock }) {
  const settings = purposeSettings[input.purpose];
  const publicId = cloudinaryPublicId(
    `elearn/${input.purpose}/${ownerId}/${randomUUID()}`, settings.resourceType,
  );
  const upload = provider.createSignedUpload({ publicId, purpose: input.purpose });
  if (!(upload.expiresAt instanceof Date)
      || !Number.isFinite(upload.expiresAt.getTime())
      || upload.expiresAt <= clock()
      || !(upload.providerUploadValidUntil instanceof Date)
      || !Number.isFinite(upload.providerUploadValidUntil.getTime())
      || upload.providerUploadValidUntil < upload.expiresAt) {
    throw new ApiError(503, 'MEDIA_PROVIDER_UNAVAILABLE',
      'Media uploads are temporarily unavailable');
  }
  const [asset] = await MediaAsset.create([{
    ownerId, revisionId, purpose: input.purpose, targetId: input.targetId, publicId,
    resourceType: settings.resourceType, deliveryType: settings.deliveryType,
    expiresAt: upload.expiresAt,
    providerUploadValidUntil: upload.providerUploadValidUntil,
  }], { session });
  return { assetId: asset.id, upload, maxBytes: settings.maxBytes() };
}

export async function inspectMediaIntent(asset, provider) {
  const uploaded = await provider.inspectUpload(asset);
  if (!uploaded) throw new ApiError(409, 'MEDIA_UPLOAD_NOT_FOUND', 'Upload is not available yet');
  const allowedFormats = asset.purpose === 'lesson_attachment' ? ['pdf'] : ['jpg', 'jpeg', 'png', 'webp'];
  // Cloudinary raw metadata omits format. Only infer PDF from the exact,
  // server-owned raw ID, never from a client filename or arbitrary provider ID.
  const expectedPublicId = cloudinaryPublicId(asset.publicId, asset.resourceType);
  const format = asset.resourceType === 'raw' && uploaded.format === undefined
    ? 'pdf' : typeof uploaded.format === 'string' ? uploaded.format.toLowerCase() : null;
  if (uploaded.public_id !== expectedPublicId || uploaded.type !== asset.deliveryType
      || uploaded.resource_type !== asset.resourceType
      || !allowedFormats.includes(format)
      || !Number.isSafeInteger(uploaded.bytes) || uploaded.bytes < 1
      || uploaded.bytes > purposeSettings[asset.purpose].maxBytes()
      || typeof uploaded.asset_id !== 'string' || uploaded.asset_id.length === 0) {
    throw new ApiError(409, 'MEDIA_UPLOAD_INVALID', 'Uploaded file does not match its intent');
  }
  return { uploaded, format };
}

export async function claimMediaIntent(asset, { uploaded, format }, session, clock) {
  const claimed = await MediaAsset.findOneAndUpdate({
    _id: asset._id, ownerId: asset.ownerId, revisionId: asset.revisionId ?? null, status: 'pending', expiresAt: { $gt: clock() },
  }, { $set: {
    status: 'ready', providerAssetId: uploaded.asset_id,
    bytes: uploaded.bytes, format, attachedAt: clock(),
    originalName: typeof uploaded.original_filename === 'string'
      ? uploaded.original_filename.replace(/[\p{Cc}\p{Cf}\\/]/gu, '').slice(0, 255) : null,
  } }, { session, returnDocument: 'after', runValidators: true });
  if (!claimed) throw new ApiError(409, 'MEDIA_STATE_CONFLICT', 'Media is no longer available for this action');
  return claimed;
}
