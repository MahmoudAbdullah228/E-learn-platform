import { Router } from 'express';
import { createPaymentController } from './payment.controller.js';

export function createPaymentWebhookRouter({ inbox }) {
  const router = Router();
  router.post('/', createPaymentController({ inbox }).webhook);
  return router;
}
