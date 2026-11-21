export function createRefundController({ service }) {
  return Object.freeze({
    async create(request, response) {
      const refund = await service.create({ auth: request.auth, orderId: request.validatedParams.orderId,
        input: request.validatedBody, idempotencyKey: request.refundKey,
        requestId: request.id == null ? null : String(request.id) });
      response.status(202).json({ data: { refund }, message: 'Refund request accepted' });
    },
    async list(request, response) { response.json({ data: await service.list(request.validatedQuery) }); },
    async get(request, response) { response.json({ data: { refund: await service.get(request.validatedParams.refundId) } }); },
  });
}
