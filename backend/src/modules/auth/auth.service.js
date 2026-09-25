import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';
import { logger, serializeError } from '../../config/logger.js';
import { OneTimeToken } from '../../models/OneTimeToken.js';
import { AuthEmailRequest } from '../../models/AuthEmailRequest.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { generateOneTimeToken, hashOneTimeToken } from '../../utils/oneTimeToken.js';
import { issueReplacementOneTimeToken } from '../../services/oneTimeTokenIssuance.service.js';

const PURPOSE = 'email_verification';
const TTL_MS = 24 * 60 * 60 * 1000;
function invalidToken() {
  return new ApiError(400, 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
    'Verification token is invalid or expired');
}

async function saveVerificationToken(userId, token, now) {
  await OneTimeToken.updateOne(
    { userId, purpose: PURPOSE },
    { $set: {
      tokenHash: hashOneTimeToken(token),
      expiresAt: new Date(now.getTime() + TTL_MS),
      consumedAt: null,
    } },
    { upsert: true, runValidators: true },
  );
}

export function createAuthService({ emailSender, clock = () => new Date() }) {
  return Object.freeze({
    async register({ name, email, password }) {
      const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
      const user = await User.create({ name, email, passwordHash, roles: ['student'], status: 'active' });
      const token = generateOneTimeToken();
      await saveVerificationToken(user.id, token, clock());

      try {
        await emailSender.sendEmailVerification({
          recipientEmail: user.email, recipientName: user.name, token,
        });
      } catch (error) {
        logger.error(serializeError(error), 'Verification email delivery failed after registration');
        throw new ApiError(503, 'EMAIL_DELIVERY_UNAVAILABLE',
          'Account created, but the verification email could not be sent. Please request a new one');
      }

      return {
        id: user.id, name: user.name, email: user.email,
        roles: user.roles, emailVerifiedAt: user.emailVerifiedAt,
      };
    },

    async verifyEmail({ token }) {
      const now = clock();
      const tokenHash = hashOneTimeToken(token);
      const oneTimeToken = await OneTimeToken.findOne({
        tokenHash, purpose: PURPOSE, consumedAt: null, expiresAt: { $gt: now },
      });
      if (!oneTimeToken) throw invalidToken();

      // This single-document transition is authoritative: only one request can verify.
      // A failed user write leaves the token untouched and retryable.
      const user = await User.findOneAndUpdate(
        { _id: oneTimeToken.userId, status: 'active', emailVerifiedAt: null },
        { $set: { emailVerifiedAt: now } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!user) throw invalidToken();

      try {
        await OneTimeToken.updateOne(
          { _id: oneTimeToken._id, tokenHash, consumedAt: null },
          { $set: { consumedAt: now } },
        );
      } catch (error) {
        // Verification has committed. User state blocks replay even if cleanup fails.
        logger.error(serializeError(error), 'Verified account token cleanup failed');
      }
      return { verified: true };
    },

    async resendEmailVerification({ email }) {
      // Identical durable enqueue for every email; no account lookup or SMTP on the request path.
      const now = clock();
      await AuthEmailRequest.create({
        email,
        purpose: PURPOSE,
        availableAt: now,
        expiresAt: new Date(now.getTime() + TTL_MS),
      });
    },

    async deliverVerificationRequest({ email, requestedAt = clock(), signal }) {
      signal?.throwIfAborted();
      const user = await User.findOne({ email, status: 'active', emailVerifiedAt: null });
      signal?.throwIfAborted();
      if (!user) return;

      await issueReplacementOneTimeToken({
        user,
        purpose: PURPOSE,
        ttlMs: TTL_MS,
        requestedAt,
        signal,
        clock,
        send: token => emailSender.sendEmailVerification({
          recipientEmail: user.email,
          recipientName: user.name,
          token,
        }),
      });
    },
  });
}
