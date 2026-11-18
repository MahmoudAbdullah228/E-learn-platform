export const adminCoursePolicyProjection = '+archivedBy +archiveReason +accessChangedBy +accessChangedAt +accessReason';

export function toCoursePolicy(course) {
  return { id: String(course._id), status: course.status, accessStatus: course.accessStatus ?? 'available',
    revision: course.policyRevision ?? 0, archivedAt: course.archivedAt ?? null,
    unavailableAt: course.unavailableAt ?? null, archivedBy: course.archivedBy?.toString() ?? null,
    archiveReason: course.archiveReason ?? null, accessChangedAt: course.accessChangedAt ?? null,
    accessChangedBy: course.accessChangedBy?.toString() ?? null, accessReason: course.accessReason ?? null };
}
