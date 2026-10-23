import { MediaAsset } from '../../models/MediaAsset.js';

// An ObjectId alone is not evidence that an image belongs to this profile.
export async function resolveAvatarUrl({ user, mediaProvider }) {
  if (!user.avatarAssetId) return null;
  const asset = await MediaAsset.findOne({
    _id: user.avatarAssetId,
    ownerId: user._id,
    targetId: user._id,
    purpose: 'avatar',
    provider: 'cloudinary',
    status: 'ready',
    resourceType: 'image',
    deliveryType: 'upload',
    format: { $in: ['jpg', 'jpeg', 'png', 'webp'] },
  }).select('publicId format').lean();
  if (!asset) return null;
  return mediaProvider.publicImageUrl({ publicId: asset.publicId, format: asset.format });
}
