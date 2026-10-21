import { Category } from '../../models/Category.js';
import { ApiError } from '../../utils/ApiError.js';

function toCategory(category) {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function slugConflict(error) {
  return error?.code === 11000 && Boolean(error?.keyPattern?.slug || error?.keyValue?.slug);
}

function categoryAlreadyExists() {
  return new ApiError(409, 'CATEGORY_SLUG_EXISTS', 'Category slug already exists');
}

async function listCategories({ isActive, page, limit }) {
  const filter = isActive === undefined ? {} : { isActive };
  const [categories, total] = await Promise.all([
    Category.find(filter).sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);
  return {
    categories: categories.map(toCategory),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export function createCategoriesService() {
  return Object.freeze({
    listPublic: ({ page, limit }) => listCategories({ isActive: true, page, limit }),
    listAdmin: ({ isActive, page, limit }) => listCategories({ isActive, page, limit }),

    async create({ input }) {
      try {
        const category = await Category.create(input);
        return toCategory(category);
      } catch (error) {
        if (slugConflict(error)) throw categoryAlreadyExists();
        throw error;
      }
    },

    async update({ categoryId, input }) {
      try {
        const category = await Category.findOneAndUpdate({ _id: categoryId },
          { $set: input }, { returnDocument: 'after', runValidators: true });
        if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Category was not found');
        return toCategory(category);
      } catch (error) {
        if (slugConflict(error)) throw categoryAlreadyExists();
        throw error;
      }
    },
  });
}
