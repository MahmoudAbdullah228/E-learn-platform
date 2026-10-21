// Raw Cloudinary assets include their extension in the public ID, unlike images.
// Resolve legacy extensionless PDF intents without changing their immutable DB identity.
export function cloudinaryPublicId(publicId, resourceType) {
  const pdfSuffix = resourceType === 'raw' && typeof publicId === 'string'
    && publicId.endsWith('.pdf');
  const base = pdfSuffix ? publicId.slice(0, -4) : publicId;
  if (!['image', 'raw'].includes(resourceType)
      || typeof base !== 'string'
      || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base)) {
    throw new TypeError('A valid server-generated Cloudinary public ID is required');
  }
  const resolved = resourceType === 'raw' ? `${base}.pdf` : base;
  if (resolved.length > 255) {
    throw new TypeError('A valid server-generated Cloudinary public ID is required');
  }
  return resolved;
}
