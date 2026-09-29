export function createInstructorApplicationsController({ instructorApplicationsService }) {
  return Object.freeze({
    async createApplication(request, response) {
      const application = await instructorApplicationsService.createApplication({
        userId: request.auth.userId,
        ...request.validatedBody,
      });
      response.status(201).json({
        data: { application },
        message: 'Instructor application submitted successfully',
      });
    },

    async getMyApplication(request, response) {
      const application = await instructorApplicationsService.getLatestApplication({
        userId: request.auth.userId,
      });
      response.status(200).json({ data: { application } });
    },

    async listApplications(request, response) {
      const result = await instructorApplicationsService.listApplications(
        request.validatedQuery,
      );
      response.status(200).json({ data: result });
    },

    async reviewApplication(request, response) {
      const application = await instructorApplicationsService.reviewApplication({
        applicationId: request.validatedParams.applicationId,
        adminUserId: request.auth.userId,
        ...request.validatedBody,
      });
      response.status(200).json({
        data: { application },
        message: `Instructor application ${application.status}`,
      });
    },
  });
}
