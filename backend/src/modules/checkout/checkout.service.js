import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { splitCourseRevenue } from '../../utils/money.js';
import { toCheckoutOrder } from './checkout.presenter.js';

const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };
const leaseMs = 120_000;
const minimumCreateWindowMs = 30 * 60 * 1000;
const paymentFields = '+checkoutRequest +checkoutSessionId +paymentIntentId';

function pending() {
  return new ApiError(409, 'PAYMENT_PENDING', 'A payment is still being prepared or confirmed');
}

function reconciliationRequired() {
  return new ApiError(503, 'PAYMENT_RECONCILIATION_REQUIRED',
    'The previous payment attempt needs reconciliation before another can be started');
}

function assertSessionMatches(session, order, payment) {
  const expectedId = payment.checkoutSessionId;
  if (!session || session.orderId !== order.id || session.metadataOrderId !== order.id
      || session.currency !== order.currency || session.amountMinor !== order.amountMinor
      || (expectedId && session.id !== expectedId)
      || !(session.expiresAt instanceof Date)
      || session.expiresAt.getTime() !== order.expiresAt.getTime()) {
    throw reconciliationRequired();
  }
}

export function createCheckoutService({ provider, clock = () => new Date(),
  shutdownTimeoutMs = 10_000 }) {
  const transaction = work => mongoose.connection.transaction(work, transactionOptions);
  const controller = new AbortController();
  const { signal } = controller;
  const running = new Set();

  function waitForProvider(operation) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); })
        .then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  }

  async function reserve({ studentId, courseId }) {
    return transaction(async session => {
      signal.throwIfAborted();
      const student = await User.findOneAndUpdate({ _id: studentId, status: 'active',
        emailVerifiedAt: { $ne: null }, roles: 'student' },
        { $inc: { checkoutRevision: 1 } }, { session, timestamps: false }).select('_id email');
      signal.throwIfAborted();
      if (!student) throw new ApiError(403, 'CHECKOUT_NOT_ALLOWED',
        'A verified active student account is required');
      const course = await Course.findOneAndUpdate({ _id: courseId, status: 'published' },
        { $inc: { checkoutRevision: 1 } }, { session, timestamps: false });
      signal.throwIfAborted();
      if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found');
      if (course.instructorId.toString() === studentId.toString()) {
        throw new ApiError(403, 'OWN_COURSE_PURCHASE_NOT_ALLOWED', 'You cannot buy your own course');
      }
      const enrolled = await Enrollment.findOne({ studentId, courseId }).select('status').session(session);
      signal.throwIfAborted();
      if (enrolled?.status === 'revoked') throw new ApiError(409, 'ENROLLMENT_REVOKED',
        'A revoked enrollment requires review before another purchase');
      if (enrolled) throw new ApiError(409, 'COURSE_ALREADY_ENROLLED',
        'You are already enrolled in this course');
      const existing = await Order.findOne({ studentId, courseId, purchaseSlotActive: true })
        .session(session);
      signal.throwIfAborted();
      if (existing) {
        if (existing.status === 'paid') throw new ApiError(409, 'COURSE_ALREADY_ENROLLED',
          'This course has already been purchased');
        if (existing.status !== 'pending') throw reconciliationRequired();
        const payment = await Payment.findOne({ orderId: existing.id })
          .select(paymentFields).session(session);
        signal.throwIfAborted();
        if (!payment) throw reconciliationRequired();
        return { order: existing, payment, created: false };
      }
      if (course.priceMinor === 0) throw new ApiError(409, 'FREE_COURSE_CHECKOUT_NOT_ALLOWED',
        'Free courses do not use payment checkout');
      if (course.priceMinor > 999_999_999_999) throw new ApiError(409, 'COURSE_PRICE_UNSUPPORTED',
        'The course price exceeds the payment provider limit');
      const settings = provider.checkoutSettings();
      // Persist a small first-request buffer beyond Stripe's 30-minute minimum.
      const expiresAtSeconds = Math.floor(clock().getTime() / 1000)
        + Math.min(settings.checkoutExpiresSeconds + 120, 86_400);
      const orderId = new mongoose.Types.ObjectId();
      const idempotencyKey = `checkout:${orderId}`;
      const [order] = await Order.create([{ _id: orderId, studentId, courseId,
        instructorId: course.instructorId, courseTitleSnapshot: course.title,
        amountMinor: course.priceMinor, currency: course.currency,
        ...splitCourseRevenue(course.priceMinor), expiresAt: new Date(expiresAtSeconds * 1000),
      }], { session });
      signal.throwIfAborted();
      const [payment] = await Payment.create([{ orderId, amountMinor: order.amountMinor,
        currency: order.currency, idempotencyKey,
        checkoutRequest: { orderId: order.id, courseTitle: order.courseTitleSnapshot,
          amountMinor: order.amountMinor, customerEmail: student.email, idempotencyKey,
          expiresAtSeconds, successUrl: settings.successUrl, cancelUrl: settings.cancelUrl },
      }], { session });
      signal.throwIfAborted();
      return { order, payment, created: true };
    });
  }

  async function processAttempt({ order, payment, created }) {
    signal.throwIfAborted();
    const now = clock();
    const leaseId = randomUUID();
    const claimed = await Payment.findOneAndUpdate({ _id: payment.id,
      status: { $in: ['created', 'processing'] },
      $or: [{ checkoutLeaseUntil: null }, { checkoutLeaseUntil: { $lte: now } }],
    }, { $set: { checkoutLeaseId: leaseId, checkoutLeaseUntil: new Date(now.getTime() + leaseMs) } },
    { returnDocument: 'after' }).select(paymentFields);
    signal.throwIfAborted();
    if (!claimed) throw pending();
    try {
      let session;
      if (claimed.checkoutSessionId) {
        session = await waitForProvider(() => provider.retrieveCheckoutSession(claimed.checkoutSessionId));
      } else if (order.expiresAt.getTime() - now.getTime() > minimumCreateWindowMs) {
        session = await waitForProvider(() => provider.createCheckoutSession(claimed.checkoutRequest.toObject()));
      } else {
        // Never reuse a potentially pruned Stripe idempotency key after a long outage.
        session = await waitForProvider(() => provider.findCheckoutSession({ orderId: order.id,
          createdAfter: Math.floor(order.createdAt.getTime() / 1000) - 60,
          createdBefore: Math.floor(order.expiresAt.getTime() / 1000) }));
        if (!session) throw reconciliationRequired();
      }
      assertSessionMatches(session, order, claimed);
      signal.throwIfAborted();
      const linked = await Payment.updateOne({ _id: claimed.id, checkoutLeaseId: leaseId,
        checkoutLeaseUntil: { $gt: clock() }, status: { $in: ['created', 'processing'] },
        $or: [{ checkoutSessionId: null }, { checkoutSessionId: session.id }],
      }, { $set: { checkoutSessionId: session.id, status: 'processing' } });
      signal.throwIfAborted();
      if (!linked.matchedCount) throw pending();
      if (session.status === 'expired' && session.paymentStatus === 'unpaid'
          && (!session.paymentIntentId || session.paymentIntentStatus === 'canceled')) {
        await transaction(async dbSession => {
          signal.throwIfAborted();
          const closed = await Payment.updateOne({ _id: claimed.id, checkoutLeaseId: leaseId,
            status: 'processing', checkoutSessionId: session.id },
          { $set: { status: 'failed' } }, { session: dbSession });
          signal.throwIfAborted();
          if (!closed.modifiedCount) throw pending();
          const released = await Order.updateOne({ _id: order.id, status: 'pending',
            purchaseSlotActive: true }, { $set: { status: 'cancelled', purchaseSlotActive: false } },
          { session: dbSession });
          signal.throwIfAborted();
          if (!released.modifiedCount) throw pending();
        });
        return { closed: true };
      }
      if (session.status !== 'open' || session.paymentStatus !== 'unpaid'
          || session.expiresAt <= clock()) throw pending();
      return { created, data: { order: toCheckoutOrder(order), checkoutUrl: session.url,
        expiresAt: session.expiresAt } };
    } catch (error) {
      signal.throwIfAborted();
      if (error?.code === 'PAYMENT_AMOUNT_UNSUPPORTED' && !claimed.checkoutSessionId) {
        await transaction(async dbSession => {
          signal.throwIfAborted();
          const failed = await Payment.updateOne({ _id: claimed.id, checkoutLeaseId: leaseId,
            status: 'created', checkoutSessionId: null },
          { $set: { status: 'failed' } }, { session: dbSession });
          signal.throwIfAborted();
          if (!failed.modifiedCount) throw reconciliationRequired();
          const released = await Order.updateOne({ _id: order.id, status: 'pending',
            purchaseSlotActive: true }, { $set: { status: 'failed', purchaseSlotActive: false } },
          { session: dbSession });
          signal.throwIfAborted();
          if (!released.modifiedCount) throw reconciliationRequired();
        });
      }
      throw error;
    } finally {
      if (!signal.aborted) {
        await Payment.updateOne({ _id: claimed.id, checkoutLeaseId: leaseId },
          { $set: { checkoutLeaseId: null, checkoutLeaseUntil: null } });
      }
    }
  }

  return Object.freeze({
    async checkout(input) {
      signal.throwIfAborted();
      const work = (async () => {
        // At most one confirmed expired attempt is replaced during a request.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = await processAttempt(await reserve(input));
          if (!result.closed) return result;
        }
        throw pending();
      })();
      running.add(work);
      try { return await work; }
      finally { running.delete(work); }
    },
    async stop() {
      controller.abort(new ApiError(503, 'SERVICE_SHUTTING_DOWN', 'The API is shutting down'));
      let deadline;
      try {
        await Promise.race([Promise.allSettled([...running]), new Promise(resolve => {
          deadline = setTimeout(resolve, shutdownTimeoutMs);
        })]);
      } finally { clearTimeout(deadline); }
    },
  });
}
