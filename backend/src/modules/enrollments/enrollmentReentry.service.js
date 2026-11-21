import { Enrollment } from '../../models/Enrollment.js';
import { Lesson } from '../../models/Lesson.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { Section } from '../../models/Section.js';
import { ApiError } from '../../utils/ApiError.js';
import { readProgressSummaries } from '../progress/progress.read.service.js';

const revoked = () => new ApiError(409, 'ENROLLMENT_REVOKED', 'This enrollment requires review before access can be restored');
const mismatch = () => new ApiError(409, 'PAYMENT_EVIDENCE_MISMATCH', 'Payment evidence requires review');
const same = (left, right) => left != null && right != null && String(left) === String(right);
const requireTransaction = session => {
  if (!session?.inTransaction()) throw new TypeError('Enrollment grants require an active transaction');
};

async function isConfirmedFullRefund({ orderId, studentId, courseId, session }) {
  const order = await Order.findOne({ _id: orderId, studentId, courseId, status: 'refunded', purchaseSlotActive: false })
    .select('_id instructorId amountMinor currency').session(session);
  if (!order) return false;
  const payment = await Payment.findOne({ orderId: order.id, status: 'refunded', provider: 'stripe',
    amountMinor: order.amountMinor, currency: order.currency }).select('_id').session(session);
  return Boolean(payment && await Refund.exists({ orderId: order.id, paymentId: payment.id,
    instructorId: order.instructorId, kind: 'full', status: 'succeeded', amountMinor: order.amountMinor,
    paymentAmountMinor: order.amountMinor, currency: order.currency,
    providerRefundId: { $type: 'string' }, completedAt: { $type: 'date' } }).session(session));
}

// Admission and fulfillment share the proof. A reason string or released slot alone
// never grants access. The caller owns the transaction and its user/course fences.
export async function refundReentrySource({ enrollment, session }) {
  requireTransaction(session);
  if (!enrollment || enrollment.status !== 'revoked' || enrollment.revocationReason !== 'refund'
      || !same(enrollment.sourceOrderId, enrollment.revocationSourceOrderId)
      || !await isConfirmedFullRefund({ orderId: enrollment.sourceOrderId,
        studentId: enrollment.studentId, courseId: enrollment.courseId, session })) throw revoked();
  return enrollment.sourceOrderId;
}

async function retainedProgress(enrollment, session) {
  const summaries = await readProgressSummaries({ enrollments: [enrollment], session });
  let lastLessonId = enrollment.lastLessonId;
  if (lastLessonId) {
    const lesson = await Lesson.findById(lastLessonId).select('sectionId').session(session);
    if (!lesson || !await Section.exists({ _id: lesson.sectionId, courseId: enrollment.courseId }).session(session)) lastLessonId = null;
  }
  return { completedAt: summaries.get(enrollment.id).completedAt, lastLessonId };
}

async function updateEnrollment(enrollment, set, session) {
  if (!Number.isSafeInteger(enrollment.progressRevision) || enrollment.progressRevision >= Number.MAX_SAFE_INTEGER) throw revoked();
  const changed = await Enrollment.findOneAndUpdate({ _id: enrollment.id, status: enrollment.status,
    sourceOrderId: enrollment.sourceOrderId, revocationReason: enrollment.revocationReason,
    revocationSourceOrderId: enrollment.revocationSourceOrderId, progressRevision: enrollment.progressRevision },
  { $set: set, $inc: { progressRevision: 1 } }, { session, returnDocument: 'after', runValidators: true });
  if (!changed) throw revoked();
  return changed;
}

export async function reactivateFreeEnrollment({ enrollment, session, now }) {
  requireTransaction(session);
  await refundReentrySource({ enrollment, session });
  const progress = await retainedProgress(enrollment, session);
  return updateEnrollment(enrollment, { ...progress, sourceOrderId: null, status: 'active', enrolledAt: now,
    revokedAt: null, revocationReason: null, revocationSourceOrderId: null }, session);
}

export async function grantPaidEnrollment({ order, session, now }) {
  requireTransaction(session);
  const existing = await Enrollment.findOne({ studentId: order.studentId, courseId: order.courseId })
    .select('+progressRevision').session(session);
  const previousId = order.replacesOrderId;
  if (previousId && !await isConfirmedFullRefund({ orderId: previousId,
    studentId: order.studentId, courseId: order.courseId, session })) throw mismatch();
  if (!existing) {
    // A repurchase must preserve its enrollment/progress identity; absence needs review.
    if (previousId) throw mismatch();
    const [created] = await Enrollment.create([{ studentId: order.studentId, courseId: order.courseId,
      sourceOrderId: order.id, enrolledAt: now }], { session });
    return created;
  }
  if (existing.status === 'active' && same(existing.sourceOrderId, order.id)) return existing;
  const expectedSource = previousId ? same(existing.sourceOrderId, previousId) : existing.sourceOrderId == null;
  if (existing.status !== 'revoked' || !expectedSource) throw mismatch();
  if (existing.revocationReason !== 'refund') {
    // A block imposed after Checkout must survive a genuine payment. Account the
    // receipt and bind its source, while retaining the independent revocation.
    return updateEnrollment(existing, { sourceOrderId: order.id }, session);
  }
  if (!previousId || !same(existing.revocationSourceOrderId, previousId)) throw mismatch();
  const progress = await retainedProgress(existing, session);
  return updateEnrollment(existing, { ...progress, sourceOrderId: order.id, status: 'active', enrolledAt: now,
    revokedAt: null, revocationReason: null, revocationSourceOrderId: null }, session);
}
