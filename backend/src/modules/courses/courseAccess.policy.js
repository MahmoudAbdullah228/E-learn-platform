// Missing accessStatus is the additive legacy default. Unknown/null values fail closed.
export const hasCourseAccess = course => Boolean(course)
  && (course.accessStatus === undefined || course.accessStatus === 'available');
export const isPublicCourse = course => hasCourseAccess(course)
  && course.status === 'published' && course.unavailableAt == null;
export const isLearningCourse = course => hasCourseAccess(course)
  && ['published', 'archived'].includes(course.status) && course.unavailableAt == null;

const accessFilter = () => ({ $or: [{ accessStatus: 'available' }, { accessStatus: { $exists: false } }] });
export const publicCourseFilter = (filter = {}) => ({ ...filter, status: 'published',
  unavailableAt: null, ...accessFilter() });
export const learningCourseFilter = (filter = {}) => ({ ...filter, status: { $in: ['published', 'archived'] },
  unavailableAt: null, ...accessFilter() });

export function courseAvailabilityCode(course, enrollmentStatus = 'active') {
  if (enrollmentStatus !== 'active') return 'ENROLLMENT_REVOKED';
  if (course && !hasCourseAccess(course)) return 'COURSE_ACCESS_BLOCKED';
  return isLearningCourse(course) ? 'AVAILABLE' : 'COURSE_UNAVAILABLE';
}
