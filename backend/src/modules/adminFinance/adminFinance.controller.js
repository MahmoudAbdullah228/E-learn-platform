export function createAdminFinanceController(service) {
  return {
    async dashboard(request, response) {
      response.json({ data: await service.dashboard(request.validatedQuery) });
    },
    async summary(request, response) {
      response.json({ data: await service.summary(request.validatedQuery) });
    },
  };
}
