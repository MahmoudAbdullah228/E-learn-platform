export function createCoursesController({ coursesService }) {
  return Object.freeze({
    async createCourse(request, response) {
      const course = await coursesService.createCourse({
        instructorId: request.auth.userId,
        input: request.validatedBody,
      });
      response.status(201).json({ data: { course }, message: 'Draft course created successfully' });
    },

    async listCourses(request, response) {
      const result = await coursesService.listCourses({
        instructorId: request.auth.userId,
        ...request.validatedQuery,
      });
      response.status(200).json({ data: result });
    },

    async getCourse(request, response) {
      const course = await coursesService.getCourse({
        instructorId: request.auth.userId,
        courseId: request.validatedParams.courseId,
      });
      response.status(200).json({ data: { course } });
    },

    async updateCourse(request, response) {
      const course = await coursesService.updateCourse({
        instructorId: request.auth.userId,
        courseId: request.validatedParams.courseId,
        input: request.validatedBody,
      });
      response.status(200).json({ data: { course }, message: 'Draft course updated successfully' });
    },
  });
}
