export function createAdminUsersController({ service }) {
  return Object.freeze({
    async list(request, response) {
      response.json({ data: await service.list(request.validatedQuery) });
    },
    async get(request, response) {
      response.json({ data: { user: await service.get(request.validatedParams.userId) } });
    },
    async changeStatus(request, response) {
      const result = await service.changeStatus({ auth: request.auth,
        userId: request.validatedParams.userId, input: request.validatedBody,
        requestId: request.id == null ? null : String(request.id) });
      response.json({ data: { user: result.user }, message: result.changed
        ? 'User status updated' : 'User status is already set to the requested value' });
    },
  });
}
