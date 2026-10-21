export function toProgressSummary({ totalLessons, completedLessons, completedAt = null }) {
  if (!Number.isSafeInteger(totalLessons) || !Number.isSafeInteger(completedLessons)
      || totalLessons < 0 || completedLessons < 0 || completedLessons > totalLessons) {
    throw new TypeError('Invalid progress counts');
  }
  const complete = totalLessons > 0 && completedLessons === totalLessons;
  return { totalLessons, completedLessons,
    // Never round an incomplete course up to 100%.
    percentage: totalLessons === 0 ? 0
      : Number(BigInt(completedLessons) * 10_000n / BigInt(totalLessons)) / 100,
    completedAt: complete ? completedAt : null };
}

export function toLessonProgress(record) {
  return { lessonId: String(record.lessonId), completed: record.completedAt != null,
    completedAt: record.completedAt ?? null };
}
