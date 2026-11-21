import { CourseRevision, RevisionLesson } from '../models/CourseRevision.js';

// An inactive historical row does not itself grant new credentials or retain media.
export async function activeRevisionLessonReferences(filter) {
  const rows = RevisionLesson.find(filter).select('revisionId').lean().cursor();
  try {
    for await (const row of rows) {
      if (await CourseRevision.exists({ _id: row.revisionId, active: true })) return true;
    }
    return false;
  } finally {
    await rows.close();
  }
}

export async function revisionReferencesMedia(asset) {
  return asset.purpose === 'course_cover'
    ? Boolean(await CourseRevision.exists({ 'metadata.coverAssetId': asset._id, active: true }))
    : activeRevisionLessonReferences({ attachments: asset._id });
}
