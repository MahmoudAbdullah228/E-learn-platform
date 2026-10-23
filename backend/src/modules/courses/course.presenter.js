export function toCategory(category) {
  if (!category) return null;
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    isActive: category.isActive,
  };
}

export function toCourse(course, category) {
  const source = course.toObject ? course.toObject() : course;
  return {
    id: source._id.toString(),
    instructorId: source.instructorId.toString(),
    categoryId: source.categoryId.toString(),
    category: toCategory(category),
    title: source.title,
    slug: source.slug,
    description: source.description,
    shortDescription: source.shortDescription ?? '',
    coverAssetId: source.coverAssetId?.toString() ?? null,
    level: source.level ?? null,
    language: source.language ?? null,
    requirements: source.requirements,
    learningOutcomes: source.learningOutcomes,
    priceMinor: source.priceMinor,
    currency: source.currency,
    status: source.status,
    submittedAt: source.submittedAt ?? null,
    reviewedAt: source.reviewedAt ?? null,
    publishedAt: source.publishedAt ?? null,
    unavailableAt: source.unavailableAt ?? null,
    reviewedBy: source.reviewedBy?.toString() ?? null,
    rejectionReason: source.rejectionReason ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}
