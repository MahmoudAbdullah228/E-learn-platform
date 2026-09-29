import { VideoCleanupJob } from '../models/VideoCleanupJob.js';

function cleanupResource(lesson) {
  if (lesson.videoAssetId) {
    return { resourceType: 'asset', resourceId: lesson.videoAssetId };
  }
  if (lesson.videoUploadId) {
    return { resourceType: 'upload', resourceId: lesson.videoUploadId };
  }
  return null;
}

export async function enqueueVideoCleanup(lessons, session) {
  const jobs = lessons.map(cleanupResource).filter(Boolean);
  if (!jobs.length) return;
  await VideoCleanupJob.bulkWrite(jobs.map(job => ({
    updateOne: {
      filter: job,
      update: { $setOnInsert: job },
      upsert: true,
    },
  })), { session, ordered: false });
}
