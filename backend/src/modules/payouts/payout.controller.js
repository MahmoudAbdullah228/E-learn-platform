export function createPayoutController(service) {
  return {
    async preview(request, response) {
      const preview = await service.preview({
        instructorId: request.validatedParams.instructorId, period: request.validatedQuery,
      });
      response.json({ data: { preview } });
    },
    async create(request, response) {
      const result = await service.create({ auth: request.auth, input: request.validatedBody,
        idempotencyKey: request.get('Idempotency-Key') });
      response.status(result.replayed ? 200 : 201).json({ data: { payout: result.payout } });
    },
    async list(request, response) {
      response.json({ data: await service.list(request.validatedQuery) });
    },
    async get(request, response) {
      response.json({ data: await service.get(request.validatedParams.payoutId) });
    },
    transition(command) {
      return async (request, response) => {
        const payout = await service.transition({ auth: request.auth, payoutId: request.validatedParams.payoutId,
          command, input: request.validatedBody, idempotencyKey: request.get('Idempotency-Key') });
        response.json({ data: { payout } });
      };
    },
  };
}
