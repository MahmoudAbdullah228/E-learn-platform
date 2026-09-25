import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';
import { logger, serializeError } from '../../config/logger.js';
import { AuthEmailRequest } from '../../models/AuthEmailRequest.js';
import { RefreshSession } from '../../models/RefreshSession.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { generateOneTimeToken, hashOneTimeToken } from '../../utils/oneTimeToken.js';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const ISSUANCE_LEASE_MS = 10 * 60 * 1000;

function availableIssuance(now) {
  return { $or: [
    { 'passwordReset.issuanceUntil': null },
    { 'passwordReset.issuanceUntil': { $lte: now } },
  ] };
}

export function createPasswordResetService({ emailSender, clock = () => new Date() }) {
  return Object.freeze({
    async requestReset({ email }) {
      const now = clock();
      await AuthEmailRequest.create({
        email, purpose: 'password_reset', availableAt: now,
        expiresAt: new Date(now.getTime() + 86_400_000),
      });
    },

    async deliverResetRequest({ email, requestedAt = clock(), signal }) {
      signal?.throwIfAborted();
      const now = clock();
      const issuanceId = randomUUID();
      // Issuance and consumption share one document as their atomic authority.
      const user = await User.findOneAndUpdate({
        email, status: 'active',
        $and: [availableIssuance(now), { $or: [
          { 'passwordReset.lastIssuedAt': null },
          { 'passwordReset.lastIssuedAt': { $lt: requestedAt } },
        ] }],
      }, { $set: {
        'passwordReset.issuanceId': issuanceId,
        'passwordReset.issuanceUntil': new Date(now.getTime() + ISSUANCE_LEASE_MS),
      } }, { returnDocument: 'after' });
      signal?.throwIfAborted();
      if (!user) {
        const current = await User.findOne({ email, status: 'active' }).select('+passwordReset');
        if (!current || current.passwordReset?.lastIssuedAt >= requestedAt) return;
        throw new Error('Password reset issuance is busy');
      }

      try {
        signal?.throwIfAborted();
        const token = generateOneTimeToken();
        await emailSender.sendPasswordReset({
          recipientEmail: user.email, recipientName: user.name, token,
        });
        signal?.throwIfAborted();
        const acceptedAt = clock();
        const activated = await User.updateOne({
          _id: user.id, status: 'active',
          'passwordReset.issuanceId': issuanceId,
          'passwordReset.issuanceUntil': { $gt: acceptedAt },
        }, { $set: {
          'passwordReset.tokenHash': hashOneTimeToken(token),
          'passwordReset.expiresAt': new Date(acceptedAt.getTime() + TOKEN_TTL_MS),
          'passwordReset.lastIssuedAt': acceptedAt,
        }, $unset: {
          'passwordReset.issuanceId': '', 'passwordReset.issuanceUntil': '',
        } });
        if (!activated.matchedCount) throw new Error('Password reset issuance lease expired');
      } finally {
        if (!signal?.aborted) {
          await User.updateOne({ _id: user.id, 'passwordReset.issuanceId': issuanceId }, {
            $unset: { 'passwordReset.issuanceId': '', 'passwordReset.issuanceUntil': '' },
          });
        }
      }
    },

    async resetPassword({ token, password }) {
      const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
      const now = clock();
      const tokenHash = hashOneTimeToken(token);
      const user = await User.findOneAndUpdate({
        status: 'active',
        'passwordReset.tokenHash': tokenHash,
        'passwordReset.expiresAt': { $gt: now },
        ...availableIssuance(now),
      }, {
        $set: { passwordHash },
        $inc: { passwordVersion: 1, tokenVersion: 1 },
        $unset: {
          'passwordReset.tokenHash': '', 'passwordReset.expiresAt': '',
          'passwordReset.issuanceId': '', 'passwordReset.issuanceUntil': '',
        },
      }, { returnDocument: 'after', runValidators: true }).select('+tokenVersion');
      if (!user) {
        const issuing = await User.exists({
          status: 'active', 'passwordReset.tokenHash': tokenHash,
          'passwordReset.expiresAt': { $gt: clock() },
          'passwordReset.issuanceUntil': { $gt: clock() },
        });
        if (issuing) throw new ApiError(409, 'PASSWORD_RESET_IN_PROGRESS',
          'A replacement reset email is being sent. Please try again shortly');
        throw new ApiError(400, 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN',
          'Password reset token is invalid or expired');
      }
      try {
        await RefreshSession.updateMany({
          userId: user.id, tokenVersion: { $lt: user.tokenVersion }, revokedAt: null,
        }, { $set: { revokedAt: now, revokedReason: 'password_reset' } });
      } catch (error) {
        // Password, consumption and session invalidation already committed together.
        logger.error(serializeError(error), 'Password reset cleanup failed');
      }
      return { passwordReset: true };
    },
  });
}
