export function createProgressController({ service }) {
  return Object.freeze({
    async setCompletion(request, response) {
      response.json({ data: await service.setCompletion({ auth: request.auth,
        ...request.validatedParams, ...request.validatedBody }) });
    },
    async setLastLesson(request, response) {
      response.json({ data: await service.setLastLesson({ auth: request.auth,
        ...request.validatedParams, ...request.validatedBody }) });
    },
  });
}
