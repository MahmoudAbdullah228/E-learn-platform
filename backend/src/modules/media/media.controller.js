export function createMediaController({ mediaService }) {
  return Object.freeze({
    async createIntent(request, response) {
      const result = await mediaService.createIntent({
        ownerId: request.auth.userId, input: request.validatedBody,
      });
      response.set('Cache-Control', 'no-store').status(201).json({ data: result });
    },
    async confirm(request, response) {
      const asset = await mediaService.confirm({
        ownerId: request.auth.userId, assetId: request.validatedParams.assetId,
      });
      response.set('Cache-Control', 'no-store').json({ data: { asset } });
    },
    async remove(request, response) {
      await mediaService.remove({
        ownerId: request.auth.userId, assetId: request.validatedParams.assetId,
      });
      response.set('Cache-Control', 'no-store').status(204).end();
    },
  });
}
