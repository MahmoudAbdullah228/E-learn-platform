import { Router } from 'express';

import { authorize } from '../../middlewares/authenticate.js';
import { validateParams, validateQuery } from '../../middlewares/validate.js';
import { createOrderController } from './order.controller.js';
import { adminOrderQuerySchema, orderParamsSchema, orderQuerySchema } from './order.schemas.js';

export function createStudentOrdersRouter({ orderService }) {
  const router = Router(); const controller = createOrderController({ orderService });
  router.use(authorize('student'));
  router.get('/', validateQuery(orderQuerySchema), controller.listMine);
  router.get('/:orderId', validateParams(orderParamsSchema), controller.getMine);
  return router;
}

export function createAdminOrdersRouter({ orderService }) {
  const router = Router(); const controller = createOrderController({ orderService });
  router.use(authorize('admin'));
  router.get('/', validateQuery(adminOrderQuerySchema), controller.listAdmin);
  router.get('/:orderId', validateParams(orderParamsSchema), controller.getAdmin);
  return router;
}
