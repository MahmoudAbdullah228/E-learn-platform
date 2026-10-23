export function createLearningAccessController({ service }) {
  return Object.freeze({
    async playback(request, response) {
      const data = await service.playback({ ...request.validatedParams, auth: request.auth });
      response.json({ data });
    },
    async download(request, response) {
      const data = await service.download({ ...request.validatedParams, auth: request.auth });
      response.json({ data });
    },
  });
}
