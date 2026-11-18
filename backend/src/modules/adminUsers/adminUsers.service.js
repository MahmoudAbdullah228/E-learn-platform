import mongoose from 'mongoose';

import { AdminSecurityState, ADMIN_SECURITY_STATE_ID } from '../../models/AdminSecurityState.js';
import { RefreshSession } from '../../models/RefreshSession.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { financialIdSchema } from '../finance/finance.schemas.js';
import { adminActorSchema, userStatusInputSchema } from './adminUsers.schemas.js';
import { decodeAdminUsersCursor, encodeAdminUsersCursor } from './adminUsers.cursor.js';
import { adminUserProjection, toAdminUser } from './adminUsers.presenter.js';
import { assertUserStatusChange } from './adminUsers.policy.js';

const unauthenticated = () => new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
const forbidden = () => new ApiError(403, 'INSUFFICIENT_PERMISSIONS', 'You do not have permission to perform this action');
const missingUser = () => new ApiError(404, 'USER_NOT_FOUND', 'User was not found');
const stateConflict = () => new ApiError(409, 'STATE_CONFLICT', 'User status changed; reload before trying again');
const capacityConflict = () => new ApiError(409, 'SECURITY_STATE_REQUIRES_REVIEW', 'Security state requires operational review');
const queryTimeoutMs = 5_000;
const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
  maxCommitTimeMS: 10_000 };
const revisionCapacity = field => ({ $or: [{ [field]: { $lt: Number.MAX_SAFE_INTEGER } },
  { [field]: { $exists: false } }] });

async function initializeSecurityGuard() {
  if (await AdminSecurityState.exists({ _id: ADMIN_SECURITY_STATE_ID })) return;
  try { await AdminSecurityState.create({ _id: ADMIN_SECURITY_STATE_ID }); }
  catch (error) { if (error?.code !== 11000 || !error.keyPattern?._id) throw error; }
}

async function fenceAdmin(auth, session, now) {
  // Write both identity and device so a concurrent suspension, role change, logout,
  // reset, or session expiry cannot commit using a stale pre-middleware decision.
  const actor = await User.findOneAndUpdate({ _id: auth.userId, status: 'active',
    emailVerifiedAt: { $ne: null }, tokenVersion: auth.tokenVersion, roles: 'admin',
    ...revisionCapacity('adminActionRevision') }, { $inc: { adminActionRevision: 1 } },
  { session, timestamps: false }).select('_id');
  if (!actor) {
    const current = await User.findById(auth.userId).select('status roles emailVerifiedAt +tokenVersion +adminActionRevision')
      .session(session);
    if (!current || current.status !== 'active' || !current.emailVerifiedAt
        || current.tokenVersion !== auth.tokenVersion) throw unauthenticated();
    if (!current.roles.includes('admin')) throw forbidden();
    throw capacityConflict();
  }
  const device = await RefreshSession.findOneAndUpdate({ userId: auth.userId,
    familyId: auth.familyId, tokenVersion: auth.tokenVersion, revokedAt: null, expiresAt: { $gt: now },
    ...revisionCapacity('adminActionRevision') }, { $inc: { adminActionRevision: 1 } },
  { session, timestamps: false }).select('_id');
  if (!device) throw unauthenticated();
}

export function createAdminUsersService({ clock = () => new Date() } = {}) {
  return Object.freeze({
    async list(query) {
      const after = decodeAdminUsersCursor(query.cursor, query);
      const conditions = [];
      if (query.role) conditions.push({ roles: query.role });
      if (query.status) conditions.push({ status: query.status });
      if (query.q) {
        const prefix = `^${query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
        conditions.push({ $or: [{ name: { $regex: prefix, $options: 'i' } },
          { email: { $regex: prefix, $options: 'i' } }] });
      }
      if (after) conditions.push({ $or: [{ createdAt: { $lt: after.createdAt } },
        { createdAt: after.createdAt, _id: { $lt: after.id } }] });
      const rows = await User.find(conditions.length ? { $and: conditions } : {})
        .select(adminUserProjection).sort({ createdAt: -1, _id: -1 }).limit(query.limit + 1)
        .maxTimeMS(queryTimeoutMs).lean();
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return { users: page.map(user => toAdminUser(user)), pagination: { hasMore,
        nextCursor: hasMore ? encodeAdminUsersCursor(page.at(-1), query) : null } };
    },

    async get(userId) {
      userId = financialIdSchema.parse(userId);
      const user = await User.findById(userId).select(adminUserProjection).maxTimeMS(queryTimeoutMs).lean();
      if (!user) throw missingUser();
      return toAdminUser(user, { detail: true });
    },

    async changeStatus({ auth, userId, input, requestId }) {
      auth = adminActorSchema.parse(auth);
      userId = financialIdSchema.parse(userId);
      input = userStatusInputSchema.parse(input);
      await initializeSecurityGuard();
      return mongoose.connection.transaction(async session => {
        const now = clock();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid security clock');
        const guard = await AdminSecurityState.findOneAndUpdate({ _id: ADMIN_SECURITY_STATE_ID,
          revision: { $lt: Number.MAX_SAFE_INTEGER } }, { $inc: { revision: 1 } }, { session });
        if (!guard) throw capacityConflict();
        await fenceAdmin(auth, session, now);
        const user = await User.findById(userId).select(`${adminUserProjection} emailVerifiedAt +tokenVersion`)
          .session(session);
        if (!user) throw missingUser();
        if (user.statusRevision !== input.expectedRevision) throw stateConflict();
        if (user.status === input.status) return { user: toAdminUser(user, { detail: true }), changed: false };
        const activeAdminCount = input.status === 'suspended' && user.roles.includes('admin')
          ? await User.countDocuments({ roles: 'admin', status: 'active', emailVerifiedAt: { $ne: null } }).session(session)
          : 0;
        assertUserStatusChange({ actorId: auth.userId, user, status: input.status, activeAdminCount });
        if (!Number.isSafeInteger(user.statusRevision) || user.statusRevision >= Number.MAX_SAFE_INTEGER
            || !Number.isSafeInteger(user.tokenVersion) || user.tokenVersion < 0
            || user.tokenVersion >= Number.MAX_SAFE_INTEGER) throw capacityConflict();
        const changed = await User.findOneAndUpdate({ _id: userId, status: user.status,
          $or: [{ statusRevision: input.expectedRevision },
            ...(input.expectedRevision === 0 ? [{ statusRevision: { $exists: false } }] : [])] },
        { $set: { status: input.status, statusChangedAt: now, statusChangedBy: auth.userId },
          $inc: { statusRevision: 1, tokenVersion: 1 } },
        { session, returnDocument: 'after', runValidators: true }).select(adminUserProjection);
        if (!changed) throw stateConflict();
        // tokenVersion is authoritative even for an old in-flight login that inserts
        // its stale-version session after this transaction's revocation sweep.
        await RefreshSession.updateMany({ userId, revokedAt: null },
          { $set: { revokedAt: now, revokedReason: input.status === 'suspended'
            ? 'account_suspended' : 'account_status_changed' } }, { session });
        await appendAuditEvent({ session, occurredAt: now, input: {
          actorType: 'user', actorId: auth.userId, action: 'user.status_changed', targetType: 'user',
          targetId: userId, fromStatus: user.status, toStatus: input.status,
          reason: input.reason, requestId: requestId ?? null,
        } });
        return { user: toAdminUser(changed, { detail: true }), changed: true };
      }, transactionOptions);
    },
  });
}
