import { createHash, randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import { AdminAuditEvent } from '../../models/AdminAuditEvent.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { InstructorFinanceState } from '../../models/InstructorFinanceState.js';
import { Payout } from '../../models/Payout.js';
import { User } from '../../models/User.js';
import { fenceActiveAdmin } from '../../services/adminAuthorization.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { payoutCommandSchemas, payoutIdSchema, payoutKeySchema } from './payout.schemas.js';
import { payoutConflict, readReservedLedger, settleReservedLedger } from './payoutLedger.service.js';

const actions = { submit: 'payout.submitted', 'mark-paid': 'payout.paid', cancel: 'payout.cancelled', reconcile: 'payout.reconciled' };
const unknownHold = payoutId => ({ sourceType: 'payout', sourceId: `transfer:${payoutId}`, reasonCode: 'PAYOUT_TRANSFER_UNKNOWN' });
const notFound = () => new ApiError(404, 'PAYOUT_NOT_FOUND', 'Payout was not found');
const stateError = () => new ApiError(409, 'INVALID_PAYOUT_TRANSITION', 'This payout cannot take the requested action');
const evidenceError = () => new ApiError(409, 'PAYOUT_EVIDENCE_MISMATCH', 'Transfer evidence does not match the sealed payout');

export const selectionCutoff = ({ cutoffAt, periodEnd }) => cutoffAt.getTime() === periodEnd.getTime()
  ? new Date(periodEnd.getTime() - 1) : cutoffAt;

export async function fencePayoutAdmission({ instructorId, session }) {
  const updated = await User.updateOne({ _id: instructorId, status: 'active', $or: [
    { payoutAdmissionRevision: { $lt: Number.MAX_SAFE_INTEGER } }, { payoutAdmissionRevision: { $exists: false } },
  ] }, { $inc: { payoutAdmissionRevision: 1 } }, { session, timestamps: false });
  if (updated.modifiedCount !== 1) {
    throw new ApiError(409, 'PAYOUT_ADMISSION_BLOCKED', 'This instructor cannot start a new payout or transfer');
  }
}

function checkReferenceNamespace(method, reference) {
  if (reference && reference.startsWith('SIM-') !== (method === 'test_simulation')) throw evidenceError();
}

function transitionIntent(payout, command, input) {
  if (command === 'submit') {
    if (payout.status !== 'draft' || payout.transferOutcome !== 'not_started') throw stateError();
    if (input.transferMethod === 'test_simulation' && env.NODE_ENV !== 'test' && !env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      throw new ApiError(409, 'PAYOUT_SIMULATION_UNAVAILABLE', 'Simulation requires Stripe Test Mode');
    }
    return 'unknown';
  }
  if (command === 'cancel' && payout.status === 'draft') {
    if (input.transferAttemptId) throw evidenceError();
    return 'confirmed_not_sent';
  }
  if (payout.status !== 'pending' || payout.transferOutcome !== 'unknown') throw stateError();
  if (!payout.sealedAt || !payout.sealedBy || !payout.transferAttemptId || !payout.transferMethod || payout.transferReference) {
    throw payoutConflict();
  }
  if (!input.transferAttemptId) {
    throw new ApiError(409, 'PAYOUT_EVIDENCE_REQUIRED', 'A sealed transfer requires referenced evidence');
  }
  if (input.transferAttemptId !== payout.transferAttemptId || input.transferMethod !== payout.transferMethod
      || (input.confirmedAmountMinor !== undefined && input.confirmedAmountMinor !== payout.amountMinor)) throw evidenceError();
  checkReferenceNamespace(input.transferMethod, input.transferReference ?? input.evidenceReference);
  if (command === 'mark-paid') return 'confirmed_paid';
  if (command === 'cancel') return 'confirmed_not_sent';
  return input.outcome;
}

async function assertSealable({ balances, payout, entries, context }) {
  await fencePayoutAdmission(context);
  const current = await balances.read({ instructorId: context.instructorId, cutoffAt: selectionCutoff(payout) },
    { ...context, reservedPayoutId: payout.id });
  if (current.balance.blocked) throw new ApiError(409, 'PAYOUT_BLOCKED', 'Unresolved financial work prevents sealing',
    current.balance.reasonCodes.map(code => ({ code })));
  const reserved = new Set(entries.map(entry => String(entry._id)));
  if (current.entries.length !== reserved.size || current.balance.netEligibleMinor !== payout.amountMinor
      || current.entries.some(entry => !reserved.has(String(entry._id)))) {
    throw new ApiError(409, 'PAYOUT_SELECTION_CHANGED', 'Cancel this draft and recalculate the settlement before sealing');
  }
}

async function finishTransfer({ payout, entries, context, finance, actorId, outcome }) {
  const { session, instructorId } = context;
  const paid = outcome === 'confirmed_paid';
  await settleReservedLedger({ payout, entries, context, finance, actorId, paid });
  if (payout.status === 'pending') {
    const hold = await FinancialHold.findOne({ instructorId, ...unknownHold(payout.id), resolvedAt: null })
      .select('_id').session(session).maxTimeMS(5000);
    if (!hold) throw payoutConflict();
    await finance.resolveHold(context, { holdId: hold.id, resolvedBy: actorId,
      resolutionCode: paid ? 'PAYOUT_TRANSFER_PAID' : 'PAYOUT_TRANSFER_NOT_SENT' });
  }
  const released = await InstructorFinanceState.updateOne({ instructorId, activePayoutId: payout.id },
    { $set: { activePayoutId: null } }, { session });
  if (released.modifiedCount !== 1) throw payoutConflict();
}

const resultStatus = { unknown: 'pending', confirmed_paid: 'paid', confirmed_not_sent: 'cancelled' };
const receipt = ({ resourceId, status, revision }) => ({ id: String(resourceId), status, revision });

function transitionFields({ outcome, command, input, actorId, now, transferAttemptId }) {
  if (command === 'submit') return { sealedAt: now, sealedBy: actorId, transferAttemptId, transferMethod: input.transferMethod };
  if (outcome === 'confirmed_paid') return { paidAt: now, paidBy: actorId, transferReference: input.transferReference };
  if (outcome === 'confirmed_not_sent') return { cancelledAt: now, cancelledBy: actorId,
    cancellationSource: 'admin', cancellationReason: input.reason };
  return {};
}

export function createPayoutLifecycleService({ finance, balances }) {
  return async function transition({ auth, payoutId, command, input, idempotencyKey }) {
    const id = payoutIdSchema.parse({ payoutId }).payoutId;
    input = payoutCommandSchemas[command].parse(input);
    const key = payoutKeySchema.parse(idempotencyKey);
    const requestFingerprint = createHash('sha256').update(JSON.stringify({ id, command, input })).digest('hex');
    const identity = { actorId: auth.userId, action: actions[command], idempotencyKey: key };
    const hint = await Payout.findById(id).select('instructorId').lean().maxTimeMS(5000);
    if (!hint) throw notFound();
    const transferAttemptId = command === 'submit' ? randomUUID() : null;
    try {
      return await finance.runForInstructor({ instructorId: String(hint.instructorId) }, async context => {
        const { session, now, instructorId } = context;
        await fenceActiveAdmin({ auth, session, now });
        const prior = await AdminAuditEvent.findOne(identity).select('+requestFingerprint +result').lean().session(session).maxTimeMS(5000);
        if (prior) {
          if (prior.requestFingerprint !== requestFingerprint) {
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'The key was already used for a different payout command');
          }
          return receipt(prior.result);
        }
        const payout = await Payout.findOne({ _id: id, instructorId }).session(session).maxTimeMS(5000);
        if (!payout) throw notFound();
        if (payout.revision !== input.expectedRevision || payout.revision >= Number.MAX_SAFE_INTEGER) {
          throw new ApiError(409, 'PAYOUT_REVISION_CONFLICT', 'Reload the payout before retrying this command');
        }
        const outcome = transitionIntent(payout, command, input);
        if (!await InstructorFinanceState.exists({ instructorId, activePayoutId: id }).session(session)) throw payoutConflict();
        const entries = await readReservedLedger(payout, session);
        if (command === 'submit') {
          await assertSealable({ balances, payout, entries, context });
          await finance.openHold(context, { ...unknownHold(id), openedBy: auth.userId });
        } else if (outcome !== 'unknown') {
          await finishTransfer({ payout, entries, context, finance, actorId: auth.userId, outcome });
        }
        const status = resultStatus[outcome];
        const fields = transitionFields({ outcome, command, input, actorId: auth.userId, now, transferAttemptId });
        const filter = { _id: id, instructorId, status: payout.status, revision: payout.revision, transferOutcome: payout.transferOutcome,
          ...Object.fromEntries(Object.keys(fields).map(field => [field, null])) };
        const changed = await Payout.updateOne(filter, { $set: { ...fields, status, transferOutcome: outcome },
          $inc: { revision: 1 } }, { session });
        if (changed.modifiedCount !== 1) throw payoutConflict();
        const result = { resourceId: id, status, revision: payout.revision + 1, httpStatus: 200 };
        await appendAuditEvent({ session, occurredAt: now, input: { ...identity, actorType: 'user', targetType: 'payout',
          targetId: id, fromStatus: payout.status, toStatus: status, reason: input.reason ?? null,
          evidenceReference: input.transferReference ?? input.evidenceReference, requestFingerprint, result } });
        return receipt(result);
      });
    } catch (error) {
      if (error?.code === 11000 && error.keyPattern?.transferReference) {
        throw new ApiError(409, 'PAYOUT_TRANSFER_REFERENCE_CONFLICT', 'This transfer reference is already recorded');
      }
      throw error;
    }
  };
}
