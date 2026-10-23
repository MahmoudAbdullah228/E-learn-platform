export function createOrderController({ orderService }) {
  return Object.freeze({
    async listMine(req, res) {
      res.json({ data: await orderService.listMine({ studentId: req.auth.userId, ...req.validatedQuery }) });
    },
    async getMine(req, res) {
      res.json({ data: await orderService.getMine({ studentId: req.auth.userId,
        orderId: req.validatedParams.orderId }) });
    },
    async listAdmin(req, res) { res.json({ data: await orderService.listAdmin(req.validatedQuery) }); },
    async getAdmin(req, res) { res.json({ data: await orderService.getAdmin(req.validatedParams.orderId) }); },
  });
}
