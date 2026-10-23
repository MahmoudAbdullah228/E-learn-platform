export function createInstructorsController({ instructorsService }) {
  return Object.freeze({
    async getPublicProfile(request, response) {
      const instructor = await instructorsService.getPublicProfile({
        instructorId: request.validatedParams.instructorId,
      });
      response.set('Cache-Control', 'public, max-age=60');
      response.status(200).json({ data: { instructor } });
    },

    async updateProfile(request, response) {
      const instructor = await instructorsService.updateProfile({
        instructorId: request.auth.userId,
        input: request.validatedBody,
      });
      response.status(200).json({
        data: { instructor },
        message: 'Instructor profile updated successfully',
      });
    },
  });
}
