import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';

import { Enrollment } from '../src/models/Enrollment.js';
import { Order } from '../src/models/Order.js';
import { toEnrollment, toLibraryCourse } from '../src/modules/enrollments/enrollment.presenter.js';
import { enrollBodySchema, libraryQuerySchema } from '../src/modules/enrollments/enrollment.schemas.js';
import { toOrder, toPayment } from '../src/modules/orders/order.presenter.js';
import { adminOrderQuerySchema, orderQuerySchema } from '../src/modules/orders/order.schemas.js';
import { toPagination } from '../src/utils/pagination.js';

test('enrollment/order query schemas are bounded and reject mass assignment and duplicate inputs', () => {
  assert.deepEqual(libraryQuerySchema.parse({}), { page: 1, limit: 20, status: 'active' });
  assert.deepEqual(orderQuerySchema.parse({ status: 'paid', limit: '100' }), { page: 1, limit: 100, status: 'paid' });
  for (const schema of [libraryQuerySchema, orderQuerySchema, adminOrderQuerySchema]) {
    for (const input of [{ page: '0' }, { page: '1000001' }, { limit: '101' }, { limit: '-1' },
      { limit: '1.5' }, { limit: ['1', '2'] }, { sort: '$where' }]) assert.equal(schema.safeParse(input).success, false);
  }
  assert.equal(orderQuerySchema.safeParse({ studentId: '0123456789abcdef01234567' }).success, false);
  assert.equal(adminOrderQuerySchema.safeParse({ studentId: '0123456789abcdef01234567' }).success, true);
  assert.equal(enrollBodySchema.safeParse({ sourceOrderId: null }).success, false);
  assert.equal(enrollBodySchema.safeParse(undefined).success, true);
  assert.deepEqual(toPagination({ page: 1, limit: 20 }, 0), { page: 1, limit: 20, total: 0, totalPages: 0 });
});

test('order/payment presenters strictly allowlist public fields and limit financial splits to admin', () => {
  const id = new mongoose.Types.ObjectId(); const date = new Date();
  const order = { _id: id, courseId: id, studentId: id, instructorId: id,
    courseTitleSnapshot: 'Snapshot', amountMinor: 100, currency: 'EGP', status: 'pending',
    expiresAt: date, createdAt: date, commissionBps: 2000, platformAmountMinor: 20,
    instructorAmountMinor: 80, purchaseSlotActive: true };
  const student = toOrder(order); const admin = toOrder(order, { admin: true });
  assert.equal(student.studentId, undefined); assert.equal(student.instructorAmountMinor, undefined);
  assert.equal(admin.instructorAmountMinor, 80); assert.equal(admin.purchaseSlotActive, undefined);
  const payment = toPayment({ _id: id, provider: 'stripe', status: 'processing', amountMinor: 100,
    currency: 'EGP', idempotencyKey: 'secret', checkoutRequest: { customerEmail: 'private' },
    checkoutSessionId: 'private', paymentIntentId: 'private', checkoutLeaseId: 'private' });
  assert.deepEqual(Object.keys(payment).sort(), ['amountMinor', 'currency', 'id', 'paidAt', 'provider', 'status']);
  assert.equal(toPayment(null), null);
});

test('enrollment/library presenters cannot serialize private course or model fields', () => {
  const id = new mongoose.Types.ObjectId();
  const dto = toEnrollment({ _id: id, courseId: id, studentId: id, status: 'active', enrolledAt: new Date() });
  assert.equal(dto.studentId, undefined); assert.equal(dto.sourceOrderId, null);
  const course = { _id: id, slug: 'public', title: 'Public', status: 'draft', privateField: 'secret' };
  assert.equal(toLibraryCourse(course), null);
  course.status = 'published';
  assert.equal(toLibraryCourse(course).privateField, undefined);
});

test('enrollment/order schemas retain uniqueness and targeted paginated-read indexes without TTL', () => {
  const enrollmentIndexes = Enrollment.schema.indexes();
  assert.ok(enrollmentIndexes.some(([keys, options]) => keys.studentId === 1 && keys.courseId === 1 && options.unique));
  assert.ok(enrollmentIndexes.some(([keys]) => keys.studentId === 1 && keys.enrolledAt === -1 && !keys.status));
  assert.ok(Order.schema.indexes().some(([keys]) => keys.studentId === 1 && keys.status === 1 && keys.createdAt === -1));
  assert.ok(Order.schema.indexes().some(([keys]) => keys.courseId === 1 && keys.createdAt === -1));
  assert.equal([...enrollmentIndexes, ...Order.schema.indexes()].some(([, options]) => options.expireAfterSeconds != null), false);
});
