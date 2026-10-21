export function createCourseReviewController({ reviewService }) {
  return Object.freeze({
    async submit(request, response) {
      const course = await reviewService.submit({
        courseId: request.validatedParams.courseId, instructorId: request.auth.userId,
      });
      response.json({ data: { course } });
    },
    async reopen(request, response) {
      const course = await reviewService.reopen({
        courseId: request.validatedParams.courseId, instructorId: request.auth.userId,
      });
      response.json({ data: { course } });
    },
    async list(request, response) {
      const result = await reviewService.listForReview(request.validatedQuery);
      response.json({ data: result });
    },
    async get(request, response) {
      const result = await reviewService.getForReview({
        courseId: request.validatedParams.courseId,
      });
      response.json({ data: result });
    },
    async review(request, response) {
      const course = await reviewService.review({
        courseId: request.validatedParams.courseId, adminId: request.auth.userId,
        ...request.validatedBody,
      });
      response.json({ data: { course } });
    },
  });
}
