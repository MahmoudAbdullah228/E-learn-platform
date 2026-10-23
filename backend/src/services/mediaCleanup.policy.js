const uploadSettlementMs = 5 * 60 * 1000;
const legacyUploadLifetimeMs = 60 * 60 * 1000;

export function pendingUploadCleanupAt(asset, now = new Date(0)) {
  const expiresAt = asset.expiresAt.getTime();
  const providerValidUntil = asset.providerUploadValidUntil?.getTime()
    ?? expiresAt + legacyUploadLifetimeMs;
  return new Date(Math.max(now.getTime(), expiresAt, providerValidUntil) + uploadSettlementMs);
}
