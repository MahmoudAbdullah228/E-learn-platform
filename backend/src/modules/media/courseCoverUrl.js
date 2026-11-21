// Both catalog and library callers select ready, public course-cover assets.
export function courseCoverUrl(course, cover, mediaProvider) {
  if (!cover || !course || !course._id.equals(cover.targetId)
      || !course.instructorId?.equals(cover.ownerId)) return null;
  return mediaProvider.publicImageUrl({ publicId: cover.publicId, format: cover.format });
}
