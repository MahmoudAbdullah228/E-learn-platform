import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

import { Category } from '../../models/Category.js';
import { Course } from '../../models/Course.js';
import { ApiError } from '../../utils/ApiError.js';
import { createSlug } from '../../utils/slug.js';

const SLUG_ATTEMPTS = 8;
const MAX_SLUG_LENGTH = 220;
const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
};

function courseNotFound() {
  return new ApiError(404, 'COURSE_NOT_FOUND', 'Draft course was not found');
}

function invalidCategory() {
  return new ApiError(400, 'INVALID_CATEGORY', 'Category is not available');
}

function isSlugConflict(error) {
  return error?.code === 11000 && Boolean(error?.keyPattern?.slug || error?.keyValue?.slug);
}

function truncateSlug(value, maximumLength) {
  const characters = Array.from(value);
  while (characters.join('').length > maximumLength) characters.pop();
  return characters.join('').replace(/-+$/g, '') || 'course';
}

function toCategory(category) {
  if (!category) return null;
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    isActive: category.isActive,
  };
}

function toCourse(course, category) {
  const source = course.toObject ? course.toObject() : course;
  return {
    id: source._id.toString(),
    instructorId: source.instructorId.toString(),
    categoryId: source.categoryId.toString(),
    category: toCategory(category),
    title: source.title,
    slug: source.slug,
    description: source.description,
    requirements: source.requirements,
    learningOutcomes: source.learningOutcomes,
    priceMinor: source.priceMinor,
    currency: source.currency,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

async function requireActiveCategory(categoryId, session) {
  const query = Category.findOne({ _id: categoryId, isActive: true }).lean();
  if (session) query.session(session);
  const category = await query;
  if (!category) throw invalidCategory();
  return category;
}

async function loadCategoryMap(courses) {
  const ids = [...new Set(courses.map(course => course.categoryId.toString()))];
  const categories = await Category.find({ _id: { $in: ids } }).lean();
  return new Map(categories.map(category => [category._id.toString(), category]));
}

export function createCoursesService({ slugSuffix = () => randomBytes(4).toString('hex') } = {}) {
  return Object.freeze({
    async createCourse({ instructorId, input }) {
      const category = await requireActiveCategory(input.categoryId);
      const baseSlug = createSlug(input.title) || 'course';

      for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
        const suffix = attempt === 0 ? '' : String(slugSuffix()).slice(0, 32);
        const maximumBaseLength = MAX_SLUG_LENGTH - (suffix ? suffix.length + 1 : 0);
        const boundedBase = truncateSlug(baseSlug, maximumBaseLength);
        const slug = suffix ? `${boundedBase}-${suffix}` : boundedBase;
        try {
          const course = await Course.create({ ...input, instructorId, slug, status: 'draft' });
          return toCourse(course, category);
        } catch (error) {
          if (!isSlugConflict(error)) throw error;
        }
      }
      throw new ApiError(409, 'COURSE_SLUG_CONFLICT',
        'A unique course URL could not be allocated; retry the request');
    },

    async listCourses({ instructorId, page, limit }) {
      const filter = { instructorId, status: 'draft' };
      const [courses, total] = await Promise.all([
        Course.find(filter).sort({ updatedAt: -1, _id: -1 })
          .skip((page - 1) * limit).limit(limit).lean(),
        Course.countDocuments(filter),
      ]);
      const categories = await loadCategoryMap(courses);
      return {
        courses: courses.map(course => toCourse(
          course,
          categories.get(course.categoryId.toString()),
        )),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },

    async getCourse({ instructorId, courseId }) {
      const course = await Course.findOne({
        _id: courseId, instructorId, status: 'draft',
      });
      if (!course) throw courseNotFound();
      const category = await Category.findById(course.categoryId).lean();
      return toCourse(course, category);
    },

    async updateCourse({ instructorId, courseId, input }) {
      return mongoose.connection.transaction(async (session) => {
        const course = await Course.findOne(
          { _id: courseId, instructorId, status: 'draft' },
          null,
          { session },
        );
        if (!course) throw courseNotFound();

        const category = await requireActiveCategory(
          input.categoryId ?? course.categoryId,
          session,
        );
        course.set(input);
        await course.save({ session });

        return toCourse(course, category);
      }, TRANSACTION_OPTIONS);
    },
  });
}
