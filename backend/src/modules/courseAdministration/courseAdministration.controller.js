export function createCourseAdministrationController({ service }) {
  const mutate = method => async (request, response) => {
    const result = await service[method]({ auth: request.auth, courseId: request.validatedParams.courseId,
      input: request.validatedBody, requestId: request.id == null ? null : String(request.id) });
    response.json({ data: { course: result.course }, message: result.changed
      ? 'Course policy updated' : 'Course policy is already set to the requested value' });
  };
  return Object.freeze({ archive: mutate('archive'), changeAccess: mutate('changeAccess') });
}
