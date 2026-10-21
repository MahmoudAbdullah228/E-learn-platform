import { z } from 'zod';

export const stagingOperationsSchema = z.strictObject({
  execute: z.boolean().default(false),
});

export function parseStagingOperationsArguments(args) {
  if (args.length === 0) return stagingOperationsSchema.parse({});
  if (args.length === 1 && args[0] === '--execute') {
    return stagingOperationsSchema.parse({ execute: true });
  }
  throw new Error('Use staging:status with no arguments or --execute');
}

const MAX_QUERY_TIME_MS = 5000;

async function summarizeStatuses(collection, statuses, clock) {
  const rows = await collection.aggregate([
    { $match: { status: { $in: statuses } } },
    { $group: { _id: '$status', count: { $sum: 1 }, oldestAt: { $min: '$createdAt' } } },
  ], { maxTimeMS: MAX_QUERY_TIME_MS }).toArray();
  return Object.fromEntries(statuses.map(status => {
    const row = rows.find(item => item._id === status);
    const timestamp = row?.oldestAt instanceof Date ? row.oldestAt.getTime() : NaN;
    return [status, {
      count: row?.count ?? 0,
      oldestAgeSeconds: Number.isFinite(timestamp)
        ? Math.max(0, Math.floor((clock.getTime() - timestamp) / 1000)) : null,
    }];
  }));
}

async function summarizeCleanup(collection, now) {
  const [row] = await collection.aggregate([
    { $group: {
      _id: null,
      queued: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$exhaustedAt', null] }, null] }, 1, 0] } },
      due: { $sum: { $cond: [{ $and: [
        { $eq: [{ $ifNull: ['$exhaustedAt', null] }, null] },
        { $lte: ['$availableAt', now] },
      ] }, 1, 0] } },
      exhausted: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$exhaustedAt', null] }, null] }, 1, 0] } },
    } },
    { $project: { _id: 0, queued: 1, due: 1, exhausted: 1 } },
  ], { maxTimeMS: MAX_QUERY_TIME_MS }).toArray();
  return { queued: row?.queued ?? 0, due: row?.due ?? 0, exhausted: row?.exhausted ?? 0 };
}

// Uses native read-only aggregates: no model initialization, indexes, workers or provider calls.
export function createStagingOperationsService({ database, clock = () => new Date() }) {
  return {
    async snapshot() {
      const now = clock();
      const webhooks = await summarizeStatuses(database.collection('webhookevents'),
        ['pending', 'processing', 'failed'], now);
      const payments = await summarizeStatuses(database.collection('payments'),
        ['created', 'processing', 'failed'], now);
      const mediaCleanup = await summarizeCleanup(database.collection('mediacleanupjobs'), now);
      const videoCleanup = await summarizeCleanup(database.collection('videocleanupjobs'), now);
      return { observedAt: now.toISOString(), webhooks, payments, mediaCleanup, videoCleanup };
    },
  };
}
