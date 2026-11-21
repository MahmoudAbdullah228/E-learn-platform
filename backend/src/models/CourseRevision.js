import mongoose from 'mongoose';

import { Course } from './Course.js';
import { Lesson } from './Lesson.js';
import { Section } from './Section.js';

const id = { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true };
const counter = { type: Number, required: true, min: 0, validate: Number.isSafeInteger };
export const metadataKeys = ['title', 'categoryId', 'description', 'shortDescription', 'priceMinor',
  'currency', 'level', 'language', 'requirements', 'learningOutcomes', 'coverAssetId'];
const metadata = Course.schema.pick(metadataKeys, { _id: false, timestamps: false });
const revision = new mongoose.Schema({ courseId: id, number: counter, baseContentRevision: counter,
  active: { type: Boolean, required: true, default: true },
  status: { type: String, required: true, default: 'draft',
    enum: ['draft', 'pending_review', 'approved', 'rejected', 'discarded'] },
  revision: { ...counter, default: 0 }, metadata: { type: metadata, required: true } }, { timestamps: true });
revision.index({ 'metadata.coverAssetId': 1 }, { partialFilterExpression: { active: true, 'metadata.coverAssetId': { $type: 'objectId' } } });
revision.index({ courseId: 1, number: 1 }, { unique: true });
revision.index({ courseId: 1 }, { unique: true, partialFilterExpression: { active: true } });

const section = Section.schema.pick(['title', 'position'], { timestamps: true });
section.add({ revisionId: id, logicalId: id });
section.index({ revisionId: 1, logicalId: 1 }, { unique: true });
section.index({ revisionId: 1, position: 1 }, { unique: true });

const lesson = Lesson.schema.pick(['title', 'description', 'position', 'isPreview', 'videoStatus',
  'videoAssetId', 'videoUploadId', 'videoUploadAttemptId', 'videoUploadExpiresAt', 'durationSeconds', 'attachments'], { timestamps: true });
lesson.add({ revisionId: id, sectionId: id, logicalId: id });
lesson.index({ videoUploadAttemptId: 1 }, { unique: true, partialFilterExpression: { videoUploadAttemptId: { $type: 'string' } } });
lesson.index({ attachments: 1, revisionId: 1 });
lesson.index({ videoUploadId: 1 }, { partialFilterExpression: { videoUploadId: { $type: 'string' } } });
lesson.index({ videoAssetId: 1 }, { partialFilterExpression: { videoAssetId: { $type: 'string' } } });
lesson.index({ revisionId: 1, logicalId: 1 }, { unique: true });
lesson.index({ revisionId: 1, sectionId: 1, position: 1 }, { unique: true });

export const CourseRevision = mongoose.model('CourseRevision', revision);
export const RevisionSection = mongoose.model('RevisionSection', section);
export const RevisionLesson = mongoose.model('RevisionLesson', lesson);
