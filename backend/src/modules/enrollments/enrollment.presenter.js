export function toEnrollment(enrollment, { lastLessonId = enrollment.lastLessonId,
  completedAt = enrollment.completedAt } = {}) {
  return { id: enrollment._id.toString(), courseId: enrollment.courseId.toString(),
    sourceOrderId: enrollment.sourceOrderId?.toString() ?? null, status: enrollment.status,
    enrolledAt: enrollment.enrolledAt, completedAt: completedAt ?? null,
    revokedAt: enrollment.revokedAt ?? null, lastLessonId: lastLessonId?.toString() ?? null };
}

export function toLibraryCourse(course, coverUrl = null) {
  // Keep a historical enrollment visible without leaking a reopened draft's content.
  if (!course || course.status !== 'published') return null;
  return { id: course._id.toString(), slug: course.slug, title: course.title,
    shortDescription: course.shortDescription ?? '', level: course.level ?? null,
    language: course.language ?? null, coverUrl };
}
