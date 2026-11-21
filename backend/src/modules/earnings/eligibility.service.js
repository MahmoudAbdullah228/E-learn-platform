import { EarningEntry } from '../../models/EarningEntry.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { FinancialPolicyVersion } from '../../models/FinancialPolicyVersion.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { ApiError } from '../../utils/ApiError.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { createFinanceFoundationService } from '../finance/finance.service.js';
import { eligibilityClaimSchema } from './earnings.schemas.js';
import { evaluateSaleEligibility } from './eligibility.policy.js';
import { hasUnresolvedFinancialEvent } from './eligibilityEvidence.service.js';

const leaseLost = () => new ApiError(409, 'EARNINGS_ELIGIBILITY_LEASE_LOST', 'Eligibility processing lease expired');
const pauseMs = 300_000;

export function createEarningsEligibilityService({ clock = () => new Date() } = {}) {
  const finance = createFinanceFoundationService({ clock });
  async function reviewHold(context, entry, payment, code) {
    const sourceType = code === 'EARNINGS_LEGACY_REQUIRES_REVIEW' ? 'legacy' : 'operations';
    let sourceId = `eligibility:${entry.id}`;
    if (await FinancialHold.exists({ instructorId: context.instructorId, sourceType,
      sourceId: { $regex: `^${sourceId}(?::r[0-9]+)?$` }, resolvedAt: null }).session(context.session).maxTimeMS(5000)) return;
    const prior = await FinancialHold.findOne({ instructorId: context.instructorId, sourceType, sourceId }).session(context.session).maxTimeMS(5000);
    if (prior) sourceId += `:r${context.revision}`;
    await finance.openHold(context, { sourceType, sourceId, paymentId: payment?.id ?? null,
      reasonCode: 'EARNINGS_ELIGIBILITY_REQUIRES_REVIEW' });
  }
  return Object.freeze({
    async evaluate(input, { signal } = {}) {
      const { entryId, leaseId } = eligibilityClaimSchema.parse(input);
      const guard = () => signal?.throwIfAborted(); guard();
      const hint = await EarningEntry.findById(entryId).select('instructorId').maxTimeMS(5000); guard();
      if (!hint) throw leaseLost();
      return finance.runForInstructor({ instructorId: String(hint.instructorId) }, async context => {
        const { session, now } = context; guard();
        const entry = await EarningEntry.findOne({ _id: entryId, instructorId: context.instructorId,
          type: 'sale', status: 'pending', payoutId: null, dependentOnPayoutId: null,
          eligibilityLeaseId: leaseId, eligibilityLeaseUntil: { $gt: clock() } }).session(session).maxTimeMS(5000);
        if (!entry) throw leaseLost(); guard();
        const order = await Order.findById(entry.orderId).session(session).maxTimeMS(5000);
        const payment = order && await Payment.findOne({ orderId: order.id }).select('+paymentIntentId').session(session).maxTimeMS(5000);
        const policy = entry.policyVersionId && await FinancialPolicyVersion.findById(entry.policyVersionId).session(session).maxTimeMS(5000); guard();
        let decision = evaluateSaleEligibility({ entry, order, payment, policy, now });
        if (!decision.deadline) await reviewHold(context, entry, payment, decision.code);
        else if (await FinancialHold.exists({ instructorId: context.instructorId, resolvedAt: null }).session(session).maxTimeMS(5000)) {
          decision = { ...decision, eligible: false, code: 'FINANCIAL_HOLD_ACTIVE' };
        } else if (await hasUnresolvedFinancialEvent({ paymentIntentId: payment.paymentIntentId, session })) {
          decision = { ...decision, eligible: false, code: 'FINANCIAL_EVENT_PENDING' };
        } else if (await EarningEntry.exists({ instructorId: context.instructorId, type: 'refund_adjustment', status: 'pending' }).session(session).maxTimeMS(5000)) {
          decision = { ...decision, eligible: false, code: 'DEPENDENT_TRANSFER_UNRESOLVED' };
        } else if (await Refund.exists({ paymentId: payment.id, status: { $nin: ['failed', 'cancelled'] } }).session(session).maxTimeMS(5000)) {
          decision = { ...decision, eligible: false, code: 'REFUND_UNRESOLVED' };
          await reviewHold(context, entry, payment, decision.code);
        }
        guard();
        if (decision.eligible) await appendAuditEvent({ session, occurredAt: now, input: { actorType: 'system',
          action: 'earning.eligible', targetType: 'earning_entry', targetId: entry.id, fromStatus: 'pending', toStatus: 'eligible' } });
        guard();
        const finishedAt = clock();
        const filter = { _id: entry.id, status: 'pending', payoutId: null, eligibilityLeaseId: leaseId,
          eligibilityLeaseUntil: { $gt: finishedAt } };
        const set = { eligibilityLeaseId: null, eligibilityLeaseUntil: null, eligibilityCheckedAt: finishedAt,
          eligibilityCheckCode: decision.code, eligibilityNextCheckAt: decision.eligible ? null
            : !decision.deadline ? new Date(finishedAt.getTime() + 86400_000)
              : decision.code === 'REFUND_WINDOW_OPEN' ? decision.deadline : new Date(finishedAt.getTime() + pauseMs) };
        if (decision.deadline && !entry.eligibleAt) { filter.eligibleAt = null; set.eligibleAt = decision.deadline; }
        if (decision.eligible) set.status = 'eligible';
        const result = await EarningEntry.updateOne(filter, { $set: set }, { session, runValidators: true, maxTimeMS: 5000 });
        if (!result.modifiedCount) throw leaseLost(); guard();
        guard(); return { code: decision.code, eligible: decision.eligible };
      });
    },
  });
}
