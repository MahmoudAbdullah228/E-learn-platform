import { RefreshSession } from '../models/RefreshSession.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { adminActorSchema } from '../utils/actorSchemas.js';

const unauthenticated = () => new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
const capacity = field => ({ $or: [{ [field]: { $lt: Number.MAX_SAFE_INTEGER } },
  { [field]: { $exists: false } }] });

// Use inside the caller's transaction: identity and device writes conflict with
// suspension, role changes, logout and reset. JWT roles alone are never authority.
export async function fenceActiveAdmin({ auth, session, now }) {
  auth = adminActorSchema.parse(auth);
  if (!session?.inTransaction() || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('Admin authorization requires an active transaction and a valid clock');
  }
  const actor = await User.findOneAndUpdate({ _id: auth.userId, status: 'active',
    emailVerifiedAt: { $ne: null }, tokenVersion: auth.tokenVersion, roles: 'admin',
    ...capacity('adminActionRevision') }, { $inc: { adminActionRevision: 1 } },
  { session, timestamps: false }).select('_id');
  if (!actor) {
    const current = await User.findById(auth.userId).select('status roles emailVerifiedAt +tokenVersion')
      .session(session);
    if (!current || current.status !== 'active' || !current.emailVerifiedAt
        || current.tokenVersion !== auth.tokenVersion) throw unauthenticated();
    if (!current.roles.includes('admin')) throw new ApiError(403, 'INSUFFICIENT_PERMISSIONS',
      'You do not have permission to perform this action');
    throw new ApiError(409, 'SECURITY_STATE_REQUIRES_REVIEW', 'Security state requires operational review');
  }
  const device = await RefreshSession.findOneAndUpdate({ userId: auth.userId,
    familyId: auth.familyId, tokenVersion: auth.tokenVersion, revokedAt: null, expiresAt: { $gt: now },
    ...capacity('adminActionRevision') }, { $inc: { adminActionRevision: 1 } },
  { session, timestamps: false }).select('_id');
  if (!device) throw unauthenticated();
}
