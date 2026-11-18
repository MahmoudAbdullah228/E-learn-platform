import { randomUUID } from 'node:crypto';
import { Refund } from '../../models/Refund.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { ApiError } from '../../utils/ApiError.js';
import { providerRefundRequestSchema, providerRefundEvidenceSchema } from './refund.schemas.js';
import { appendAuditEvent } from '../audit/audit.service.js';

const privateFields = '+providerIdempotencyKey +paymentIntentId +providerRefundId +dispatchStartedAt +leaseId';
const leaseMs = 120_000;
function abortable(operation, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
export function createRefundIssuanceService({ provider, finance, shutdownSignal, operationTimeoutMs = 11_000 }) {
  return Object.freeze({
    async issue({ refundId, instructorId }) {
      shutdownSignal.throwIfAborted();
      const leaseId = randomUUID();
      const claimed = await finance.runForInstructor({ instructorId }, async ({ session, now }) => {
        shutdownSignal.throwIfAborted();
        const row = await Refund.findOneAndUpdate({ _id: refundId, instructorId, source: 'admin',
          status: 'requested', dispatchStartedAt: null, attempts: 0, policyVersionId: { $ne: null },
          paymentIntentId: { $type: 'string' } },
        { $set: { status: 'processing', dispatchStartedAt: now, leaseId,
          leaseUntil: new Date(now.getTime() + leaseMs) }, $inc: { attempts: 1, revision: 1 } },
        { session, returnDocument: 'after', runValidators: true }).select(privateFields);
        shutdownSignal.throwIfAborted();
        if (row && !await FinancialHold.exists({ instructorId, paymentId: row.paymentId,
          sourceType: 'refund', sourceId: row.id, resolvedAt: null }).session(session)) {
          throw new ApiError(409, 'FINANCIAL_HOLD_REQUIRED', 'Refund issuance requires its unresolved financial hold');
        }
        return row;
      });
      if (!claimed) return false;
      const input = providerRefundRequestSchema.parse({ refundId: claimed.id, orderId: String(claimed.orderId),
        paymentId: String(claimed.paymentId), paymentIntentId: claimed.paymentIntentId, amountMinor: claimed.amountMinor,
        currency: claimed.currency, providerIdempotencyKey: claimed.providerIdempotencyKey });
      const signal = AbortSignal.any([shutdownSignal, AbortSignal.timeout(operationTimeoutMs)]);
      let evidence; let failureCode;
      try {
        evidence = providerRefundEvidenceSchema.parse(await abortable(() => provider.createRefund(input, { signal }), signal));
        if (evidence.refundId !== input.refundId || evidence.orderId !== input.orderId || evidence.paymentId !== input.paymentId
            || evidence.paymentIntentId !== input.paymentIntentId || evidence.amountMinor !== input.amountMinor
            || evidence.currency !== input.currency) throw new ApiError(409, 'REFUND_EVIDENCE_MISMATCH', 'Refund evidence requires review');
      } catch (error) {
        if (shutdownSignal.aborted) return false;
        evidence = null;
        failureCode = error?.code === 'REFUND_EVIDENCE_MISMATCH' ? error.code : 'REFUND_PROVIDER_UNAVAILABLE';
      }
      shutdownSignal.throwIfAborted();
      return finance.runForInstructor({ instructorId }, async ({ session, now }) => {
        shutdownSignal.throwIfAborted();
        const current = await Refund.findOne({ _id: refundId, instructorId, status: 'processing', leaseId,
          leaseUntil: { $gt: now } }).select('+providerRefundId +providerCreatedAt').session(session);
        if (!current) return false;
        const validEvidence = evidence && evidence.createdAt <= now
          && (!current.providerRefundId || current.providerRefundId === evidence.providerRefundId)
          && (!current.providerCreatedAt || current.providerCreatedAt.getTime() === evidence.createdAt.getTime()) ? evidence : null;
        const set = { status: validEvidence ? 'pending' : 'requires_reconciliation',
          failureCode: validEvidence ? null : evidence ? 'REFUND_EVIDENCE_MISMATCH' : failureCode,
          leaseId: null, leaseUntil: null, nextAttemptAt: null };
        const filter = { _id: refundId, status: 'processing', leaseId, leaseUntil: { $gt: now } };
        if (validEvidence) {
          set.providerStatus = validEvidence.status; set.providerObservedAt = now;
          if (!current.providerRefundId) { filter.providerRefundId = null; set.providerRefundId = validEvidence.providerRefundId; }
          if (!current.providerCreatedAt) { filter.providerCreatedAt = null; set.providerCreatedAt = validEvidence.createdAt; }
        }
        const result = await Refund.updateOne(filter, { $set: set, $inc: { revision: 1 } }, { session, runValidators: true });
        shutdownSignal.throwIfAborted();
        if (!result.modifiedCount) return false;
        if (!validEvidence) await appendAuditEvent({ session, occurredAt: now, input: { actorType: 'system',
          action: 'refund.reconciliation_required', targetType: 'refund', targetId: refundId,
          fromStatus: 'processing', toStatus: 'requires_reconciliation' } });
        shutdownSignal.throwIfAborted();
        return true;
      });
    },
  });
}
