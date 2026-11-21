import { metadataKeys, RevisionLesson, RevisionSection } from '../../models/CourseRevision.js';
import { Lesson } from '../../models/Lesson.js';
import { Section } from '../../models/Section.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { RevisionBeforeImage } from '../../models/RevisionBeforeImage.js';
import { ApiError } from '../../utils/ApiError.js';

const sectionFields = ['title', 'position'];
const lessonFields = [...sectionFields, 'description', 'sectionId', 'isPreview', 'attachments', 'videoStatus',
  'durationSeconds', 'videoAssetId'];
const privateVideo = '+videoAssetId +videoUploadAttemptId +videoUploadId +videoUploadExpiresAt';
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function revisionDiff(row, course, session, validateMedia = false) {
  const changes = [];
  function compare(kind, id, before, after, keys) {
    const fields = after && pick(after, keys);
    if (before && after && same(pick(before, keys), fields)) return;
    if (changes.length >= 250) throw new ApiError(409, 'REVISION_TOO_LARGE', 'Split changes into revisions of at most 250 changed rows');
    if (kind === 'lesson' && after && (!before || before.videoAssetId !== after.videoAssetId || after.videoUploadAttemptId)) {
      Object.assign(fields, pick(after, ['videoUploadAttemptId', 'videoUploadId', 'videoUploadExpiresAt']));
    }
    changes.push({ kind, id, before, fields });
  }
  compare('course', course._id, course, row.metadata, metadataKeys);
  const live = await Section.find({ courseId: course._id }).session(session).lean();
  const draft = await RevisionSection.find({ revisionId: row._id }).session(session).lean();
  const byId = rows => new Map(rows.map(item => [String(item.logicalId ?? item._id), item]));
  const sections = byId(live), candidates = byId(draft);
  for (const id of new Set([...sections.keys(), ...candidates.keys()])) {
    const section = sections.get(id), candidate = candidates.get(id);
    compare('section', id, section, candidate, sectionFields);
    const lessons = byId(await Lesson.find({ sectionId: id }).select(privateVideo).session(session).lean());
    const drafts = byId(await RevisionLesson.find({ revisionId: row._id, sectionId: id }).select(privateVideo).session(session).lean());
    for (const lessonId of new Set([...lessons.keys(), ...drafts.keys()])) {
      compare('lesson', lessonId, lessons.get(lessonId), drafts.get(lessonId), lessonFields);
    }
    const attached = [...drafts.values()].filter(item => item.attachments.length);
    if (validateMedia && attached.length) {
      const assets = byId(await MediaAsset.find({ _id: { $in: attached.flatMap(item => item.attachments) },
        ownerId: course.instructorId, status: 'ready', purpose: 'lesson_attachment', deliveryType: 'authenticated',
        format: 'pdf' }).select('targetId').session(session).lean());
      if (attached.some(item => String(assets.get(String(item.attachments[0]))?.targetId) !== String(item.logicalId))) {
        throw new ApiError(409, 'COURSE_NOT_READY', 'A lesson attachment is unavailable');
      }
    }
  }
  return changes;
}

export async function publishChanges(changes, course, row, session) {
  for (const { kind, id, before, fields } of changes) {
    if (before) await RevisionBeforeImage.create([{ revisionId: row._id, kind, logicalId: id,
      before: kind === 'course' ? pick(before, metadataKeys) : before }], { session });
    if (kind === 'course') { course.set(fields); continue; }
    const Model = kind === 'lesson' ? Lesson : Section;
    if (!fields) await Model.deleteOne({ _id: id }, { session });
    else if (before) await Model.updateOne({ _id: id }, { $set: fields }, { session, runValidators: true });
    else await Model.create([{ _id: id, ...fields, ...(kind === 'section' ? { courseId: course._id } : {}) }], { session });
  }
  course.curriculumRevision = (course.curriculumRevision ?? 0) + 1;
  await course.save({ session });
}
