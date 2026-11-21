import { WebhookEvent } from '../../models/WebhookEvent.js';
import { financialEventTypes } from '../refunds/refundEvent.schemas.js';

const types = [...financialEventTypes, 'refund.reconciled'];
export async function hasUnresolvedFinancialEvent({ paymentIntentId, paymentIntentIds = [], session }) {
  return Boolean(await WebhookEvent.exists({ provider: 'stripe', eventType: { $in: types },
    status: { $in: ['pending', 'processing', 'failed'] },
    // An unassociated charge/dispute cannot safely be assigned to an instructor yet.
    $or: [{ paymentIntentId: { $in: paymentIntentId ? [paymentIntentId] : paymentIntentIds } }, { paymentIntentId: null }],
  }).session(session).maxTimeMS(5000));
}
