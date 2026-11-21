import { RevisionLesson } from '../../models/CourseRevision.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { ApiError } from '../../utils/ApiError.js';
import { claimMediaIntent, inspectMediaIntent, issueMediaIntent } from '../media/mediaIntent.service.js';
import { cleanupCandidateMedia, releaseCandidateAsset } from './revisionMediaCleanup.service.js';
import { accessCandidate } from './courseRevisions.service.js';

const missing = () => new ApiError(404, 'MEDIA_NOT_FOUND', 'Course revision media was not found');
const clock = () => new Date();

async function findTarget(row, { purpose, targetId }, session) {
  if (purpose === 'course_cover') {
    if (!row.courseId.equals(targetId)) throw missing();
    return row.metadata;
  }
  const lesson = await RevisionLesson.findOne({ revisionId: row._id, logicalId: targetId }).session(session);
  if (!lesson) throw missing();
  return lesson;
}

export function candidateMedia(provider) {
  async function issue(row, session, { input, auth }) {
    await findTarget(row, input, session);
    return issueMediaIntent({ ownerId: auth.userId, input, provider, clock, revisionId: row._id, session });
  }

  async function confirm(context) {
    const filter = { _id: context.assetId, ownerId: context.auth.userId, revisionId: context.revisionId,
      status: 'pending', expiresAt: { $gt: clock() } };
    const asset = await accessCandidate(context, null, async (row, session) => {
      if (row.status !== 'draft' || row.revision !== context.input.expectedRevision) {
        throw new ApiError(409, 'STATE_CONFLICT', 'Reload the current revision');
      }
      const found = await MediaAsset.findOne(filter).session(session);
      if (!found) throw missing();
      return found;
    });
    const inspected = await inspectMediaIntent(asset, provider);
    return accessCandidate(context, async (row, session) => {
      const target = await findTarget(row, asset, session);
      const claimed = await claimMediaIntent(asset, inspected, session, clock);
      if (asset.purpose === 'course_cover') {
        if (target.coverAssetId) await cleanupCandidateMedia(row._id, session, { _id: target.coverAssetId });
        target.coverAssetId = claimed._id;
      } else {
        if (target.attachments.length) throw new ApiError(409, 'ATTACHMENT_LIMIT_REACHED', 'Detach the current attachment first');
        target.attachments = [claimed._id];
        await target.save({ session });
      }
      return { assetId: claimed.id };
    });
  }

  async function remove(row, session, { assetId, auth }) {
    const asset = await MediaAsset.findOne({ _id: assetId, ownerId: auth.userId,
      status: { $in: ['pending', 'ready'] }, $or: [{ revisionId: row._id }, { revisionId: null }] }).session(session);
    if (!asset || asset.purpose === 'avatar') throw missing();
    const target = await findTarget(row, asset, session);
    if (asset.purpose === 'course_cover' && target.coverAssetId?.equals(asset._id)) {
      target.coverAssetId = null;
    } else if (asset.purpose === 'lesson_attachment' && target.attachments.some(id => id.equals(asset._id))) {
      target.attachments = [];
      await target.save({ session });
    } else if (!asset.revisionId || asset.status !== 'pending') throw missing();
    if (asset.revisionId) await releaseCandidateAsset(asset, session);
  }
  return { issue, confirm, remove };
}
