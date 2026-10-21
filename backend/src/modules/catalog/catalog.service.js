import mongoose from 'mongoose';

import { Category } from '../../models/Category.js';
import { Course } from '../../models/Course.js';
import { Lesson } from '../../models/Lesson.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { Section } from '../../models/Section.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { normalizeSearchText } from '../../utils/searchText.js';
import { summarizeCurriculum } from './curriculumSummary.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCategory(category) {
  if (!category) return null;
  return { id: category._id.toString(), name: category.name, slug: category.slug };
}

function toInstructor(user, { details = false } = {}) {
  if (!user) return null;
  const result = { id: user._id.toString(), name: user.name };
  if (details) {
    const approved = user.status === 'active' && user.instructorStatus === 'approved'
      && user.roles?.includes('instructor');
    result.bio = approved ? user.instructorProfile?.bio ?? null : null;
    result.expertise = approved ? user.instructorProfile?.expertise ?? null : null;
    result.links = approved ? (user.instructorProfile?.links ?? []).map(link => ({
      label: link.label, url: link.url,
    })) : [];
  }
  return result;
}

function toSummary(course, category, instructor, coverUrl) {
  return {
    id: course._id.toString(), slug: course.slug, title: course.title,
    shortDescription: course.shortDescription ?? '',
    category: toCategory(category), instructor: toInstructor(instructor),
    coverUrl, level: course.level ?? null, language: course.language ?? null,
    priceMinor: course.priceMinor, currency: course.currency,
    publishedAt: course.publishedAt ?? null,
  };
}

async function relatedData(courses, mediaProvider, { instructorDetails = false, session } = {}) {
  const categoryIds = [...new Set(courses.map(course => course.categoryId.toString()))];
  const instructorIds = [...new Set(courses.map(course => course.instructorId.toString()))];
  const coverIds = [...new Set(courses.filter(course => course.coverAssetId)
    .map(course => course.coverAssetId.toString()))];
  // Transaction operations must run sequentially on the shared snapshot session.
  const categories = await Category.find({ _id: { $in: categoryIds } })
    .select('_id name slug').session(session ?? null).lean();
  const instructors = await User.find({ _id: { $in: instructorIds } })
    .select(instructorDetails ? '_id name status instructorStatus roles instructorProfile'
      : '_id name').session(session ?? null).lean();
  const covers = await MediaAsset.find({ _id: { $in: coverIds }, status: 'ready', purpose: 'course_cover',
    resourceType: 'image', deliveryType: 'upload' })
    .select('_id publicId format targetId ownerId').session(session ?? null).lean();
  const byId = items => new Map(items.map(item => [item._id.toString(), item]));
  const coversById = byId(covers);
  const coverUrl = course => {
    const asset = coversById.get(course.coverAssetId?.toString());
    if (!asset || asset.targetId.toString() !== course._id.toString()
        || asset.ownerId.toString() !== course.instructorId.toString()) return null;
    return mediaProvider.publicImageUrl({ publicId: asset.publicId, format: asset.format });
  };
  return { categories: byId(categories), instructors: byId(instructors), coverUrl };
}

export function createCatalogService({ mediaProvider }) {
  return Object.freeze({
    async list({ q, categoryId, pricing, page, limit }) {
      const filter = { status: 'published' };
      if (categoryId) filter.categoryId = categoryId;
      if (pricing === 'free') filter.priceMinor = 0;
      if (pricing === 'paid') filter.priceMinor = { $gt: 0 };
      if (q) filter.titleSearch = { $regex: `^${escapeRegex(normalizeSearchText(q))}` };
      const [courses, total] = await Promise.all([
        Course.find(filter).sort({ publishedAt: -1, _id: -1 })
          .skip((page - 1) * limit).limit(limit).lean(),
        Course.countDocuments(filter),
      ]);
      const related = await relatedData(courses, mediaProvider);
      return {
        courses: courses.map(course => toSummary(course,
          related.categories.get(course.categoryId.toString()),
          related.instructors.get(course.instructorId.toString()), related.coverUrl(course))),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },

    async getBySlug(slug) {
      return mongoose.connection.transaction(async session => {
        const course = await Course.findOne({ slug, status: 'published' }).session(session).lean();
        if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found');
        const related = await relatedData([course], mediaProvider,
          { instructorDetails: true, session });
        const instructor = related.instructors.get(course.instructorId.toString());
        const sections = await Section.find({ courseId: course._id })
          .select('_id title position').sort({ position: 1, _id: 1 }).session(session).lean();
        const lessons = await Lesson.find({ sectionId: { $in: sections.map(item => item._id) } })
          .select('_id sectionId title description position durationSeconds videoStatus isPreview')
          .sort({ position: 1, _id: 1 }).session(session).lean();
        const bySection = new Map(sections.map(section => [section._id.toString(), []]));
        for (const lesson of lessons) {
          bySection.get(lesson.sectionId.toString()).push({
            id: lesson._id.toString(), title: lesson.title,
            description: lesson.description ?? '', position: lesson.position,
            durationSeconds: lesson.durationSeconds, isPreview: lesson.isPreview,
          });
        }
        return {
          ...toSummary(course, related.categories.get(course.categoryId.toString()),
            instructor, related.coverUrl(course)),
          description: course.description,
          requirements: course.requirements,
          learningOutcomes: course.learningOutcomes,
          ...summarizeCurriculum({ sections, lessons }),
          instructor: toInstructor(instructor, { details: true }),
          sections: sections.map(section => ({ id: section._id.toString(), title: section.title,
            position: section.position, lessons: bySection.get(section._id.toString()) })),
        };
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    },
  });
}
