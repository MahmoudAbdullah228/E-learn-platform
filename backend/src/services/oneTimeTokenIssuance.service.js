import { randomUUID } from 'node:crypto';

import { OneTimeToken } from '../models/OneTimeToken.js';
import { generateOneTimeToken, hashOneTimeToken } from '../utils/oneTimeToken.js';

const ISSUANCE_LEASE_MS = 10 * 60 * 1000;

export async function issueReplacementOneTimeToken({
  user,
  purpose,
  ttlMs,
  requestedAt,
  signal,
  send,
  clock,
}) {
  signal?.throwIfAborted();
  await OneTimeToken.findOneAndUpdate(
    { userId: user.id, purpose },
    {
      $setOnInsert: {
        tokenHash: hashOneTimeToken(generateOneTimeToken()),
        expiresAt: new Date(clock().getTime() + ttlMs),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  signal?.throwIfAborted();

  const issuanceId = randomUUID();
  const now = clock();
  const claimed = await OneTimeToken.findOneAndUpdate(
    {
      userId: user.id,
      purpose,
      $and: [
        { $or: [{ issuanceUntil: null }, { issuanceUntil: { $lte: now } }] },
        { $or: [{ lastIssuedAt: null }, { lastIssuedAt: { $lt: requestedAt } }] },
      ],
    },
    {
      $set: {
        issuanceId,
        issuanceUntil: new Date(now.getTime() + ISSUANCE_LEASE_MS),
      },
    },
    { returnDocument: 'after' },
  );
  signal?.throwIfAborted();

  if (!claimed) {
    const current = await OneTimeToken.findOne({ userId: user.id, purpose });
    if (current?.lastIssuedAt && current.lastIssuedAt >= requestedAt) return;
    throw new Error('One-time token issuance is busy');
  }

  const token = generateOneTimeToken();
  try {
    signal?.throwIfAborted();
    await send(token);
    signal?.throwIfAborted();

    const acceptedAt = clock();
    const result = await OneTimeToken.updateOne(
      { _id: claimed._id, issuanceId, issuanceUntil: { $gt: acceptedAt } },
      {
        $set: {
          tokenHash: hashOneTimeToken(token),
          expiresAt: new Date(acceptedAt.getTime() + ttlMs),
          consumedAt: null,
          lastIssuedAt: acceptedAt,
          issuanceId: null,
          issuanceUntil: null,
        },
      },
    );
    if (!result.matchedCount) throw new Error('One-time token issuance lease expired');
  } finally {
    // A forced shutdown leaves the lease to expire rather than issuing database
    // operations while the connection is closing.
    if (!signal?.aborted) {
      await OneTimeToken.updateOne(
        { _id: claimed._id, issuanceId },
        { $set: { issuanceId: null, issuanceUntil: null } },
      );
    }
  }
}
