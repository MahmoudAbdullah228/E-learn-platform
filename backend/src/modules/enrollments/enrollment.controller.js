export function createEnrollmentController({ enrollmentService }) {
  return Object.freeze({
    async enroll(req, res) {
      const result = await enrollmentService.enrollFree({ studentId: req.auth.userId,
        courseId: req.validatedParams.courseId });
      res.status(result.created ? 201 : 200).json({ data: { enrollment: result.enrollment } });
    },
    async list(req, res) {
      res.json({ data: await enrollmentService.listLibrary({ studentId: req.auth.userId,
        ...req.validatedQuery }) });
    },
    async get(req, res) {
      res.json({ data: await enrollmentService.getLearningCourse({ studentId: req.auth.userId,
        courseId: req.validatedParams.courseId }) });
    },
  });
}
