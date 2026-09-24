import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';
import { RefreshSession } from '../../models/RefreshSession.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '../../utils/sessionToken.js';

const DUMMY_PASSWORD_HASHES = Object.freeze({
  10: '$2b$10$SdhcweIrbrYXdfPFCIYXEeuRiGzJtP2q9Mo7io64Evi08GpOhAzuS',
  11: '$2b$11$bcgXdYIvNrQV1K4yhJgkauauBXpZL9DE9Y5.qJraRI0/zFPw22uNi',
  12: '$2b$12$hdF8R0WbU4RhzwMpr2sWKOjOjPuf4JSBCBHxDL51h2WNnsIB/7Bsq',
  13: '$2b$13$2sEo3rEHF5opEk3NSvIYqOc.Z9wcoprE8anD/cp4gmR5/dQzIBWNW',
  14: '$2b$14$qWM37oaM7FSU/wSzLDx1cefT8eGxyroD5l2ZleWa7wJ6EhOBjULo6',
});

function invalidCredentials() {
  return new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
}

function invalidRefreshToken() {
  return new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh session is invalid or expired');
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

export function createSessionService({ clock = () => new Date() } = {}) {
  async function createSession(user) {
    const familyId = randomUUID();
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(clock().getTime() + env.REFRESH_TOKEN_TTL_SECONDS * 1000);
    const accessToken = await signAccessToken({
      userId: user.id,
      roles: user.roles,
      tokenVersion: user.tokenVersion,
      familyId,
    });
    await RefreshSession.create({
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      tokenVersion: user.tokenVersion,
      expiresAt,
    });
    return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
  }

  return Object.freeze({
    async login({ email, password }) {
      const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');
      const passwordMatches = await bcrypt.compare(password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASHES[env.BCRYPT_ROUNDS]);
      if (!user || !passwordMatches) throw invalidCredentials();
      if (user.status !== 'active') {
        throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
      }
      if (!user.emailVerifiedAt) {
        throw new ApiError(403, 'EMAIL_NOT_VERIFIED',
          'Verify your email address before signing in');
      }

      return { ...(await createSession(user)), user: publicUser(user) };
    },

    async refresh({ refreshToken }) {
      const now = clock();
      const tokenHash = hashRefreshToken(refreshToken);
      const session = await RefreshSession.findOne({
        $or: [{ tokenHash }, { usedTokenHashes: tokenHash }],
      }).select('+tokenHash +usedTokenHashes');

      if (!session) throw invalidRefreshToken();
      if (session.usedTokenHashes.includes(tokenHash)) {
        await RefreshSession.updateOne({ _id: session._id, revokedAt: null }, {
          $set: { revokedAt: now, revokedReason: 'reuse_detected' },
        });
        throw invalidRefreshToken();
      }
      if (session.revokedAt || session.expiresAt <= now) throw invalidRefreshToken();

      const user = await User.findById(session.userId).select('+tokenVersion');
      if (!user || user.status !== 'active' || !user.emailVerifiedAt ||
          user.tokenVersion !== session.tokenVersion) {
        await RefreshSession.updateOne({ _id: session._id, revokedAt: null }, {
          $set: { revokedAt: now, revokedReason: 'account_suspended' },
        });
        throw invalidRefreshToken();
      }

      const replacementToken = generateRefreshToken();
      const replacementHash = hashRefreshToken(replacementToken);
      // Sign before committing rotation so signing failure leaves the old token usable.
      const accessToken = await signAccessToken({
        userId: user.id, roles: user.roles, tokenVersion: user.tokenVersion,
        familyId: session.familyId,
      });
      const rotated = await RefreshSession.findOneAndUpdate({
        _id: session._id,
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: now },
      }, {
        $set: { tokenHash: replacementHash },
        $push: { usedTokenHashes: tokenHash },
      }, { returnDocument: 'after' });

      if (!rotated) {
        await RefreshSession.updateOne({ _id: session._id, revokedAt: null }, {
          $set: { revokedAt: now, revokedReason: 'reuse_detected' },
        });
        throw invalidRefreshToken();
      }

      return {
        accessToken,
        refreshToken: replacementToken,
        refreshExpiresAt: session.expiresAt,
      };
    },

    async logout({ refreshToken }) {
      if (!refreshToken) return;
      const tokenHash = hashRefreshToken(refreshToken);
      await RefreshSession.updateOne({
        $or: [{ tokenHash }, { usedTokenHashes: tokenHash }],
        revokedAt: null,
      }, { $set: { revokedAt: clock(), revokedReason: 'logout' } });
    },

    async logoutAll({ userId }) {
      const now = clock();
      const user = await User.findOneAndUpdate({ _id: userId },
        { $inc: { tokenVersion: 1 } }, { returnDocument: 'after' }).select('+tokenVersion');
      if (!user) return;
      // The version change is authoritative even if cleanup fails or an old
      // in-flight login creates its session after this cleanup has finished.
      await RefreshSession.updateMany({ userId, revokedAt: null,
        tokenVersion: { $lt: user.tokenVersion } }, {
        $set: { revokedAt: now, revokedReason: 'logout_all' },
      });
    },
  });
}
