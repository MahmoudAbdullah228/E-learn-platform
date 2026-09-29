export function createCurriculumController({ curriculumService }) {
  const action = (name, status = 200) => async (request, response) => {
    const data = await curriculumService[name]({
      ...request.validatedParams,
      instructorId: request.auth.userId,
      input: request.validatedBody,
    });
    response.status(status).json({ data });
  };

  return Object.freeze({
    listSections: action('listSections'),
    createSection: action('createSection', 201),
    updateSection: action('updateSection'),
    deleteSection: action('deleteSection'),
    reorderSections: action('reorderSections'),
    createLesson: action('createLesson', 201),
    updateLesson: action('updateLesson'),
    deleteLesson: action('deleteLesson'),
    reorderLessons: action('reorderLessons'),
  });
}
