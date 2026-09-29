export function createVideoController({ videoService }) {
  return Object.freeze({
    async createUpload(request, response) {
      const data = await videoService.createUpload({
        lessonId: request.validatedParams.lessonId,
        instructorId: request.auth.userId,
      });
      response.set('Cache-Control', 'no-store');
      response.status(201).json({ data });
    },

    async webhook(request, response) {
      const data = await videoService.handleWebhook({
        rawBody: request.body,
        headers: request.headers,
      });
      response.status(200).json({ data });
    },
  });
}
