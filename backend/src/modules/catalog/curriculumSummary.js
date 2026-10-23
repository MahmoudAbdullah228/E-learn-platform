export function summarizeCurriculum({ sections, lessons }) {
  let duration = 0n;
  let unknownDurationCount = 0;
  for (const lesson of lessons) {
    // Zero is the existing model's sentinel for missing provider duration.
    if (lesson.videoStatus !== 'ready' || !Number.isSafeInteger(lesson.durationSeconds)
        || lesson.durationSeconds <= 0) {
      unknownDurationCount += 1;
    } else {
      duration += BigInt(lesson.durationSeconds);
    }
  }
  return {
    sectionCount: sections.length,
    lessonCount: lessons.length,
    totalDurationSeconds: unknownDurationCount || duration > BigInt(Number.MAX_SAFE_INTEGER)
      ? null : Number(duration),
    unknownDurationCount,
  };
}
