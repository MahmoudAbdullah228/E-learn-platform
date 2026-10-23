import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';
import Stripe from 'stripe';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Lesson } from '../src/models/Lesson.js';
import { LessonProgress } from '../src/models/LessonProgress.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createEnrollmentService } from '../src/modules/enrollments/enrollment.service.js';
import { createOrderService } from '../src/modules/orders/order.service.js';
import { createPaymentInboxService } from '../src/modules/payments/paymentInbox.service.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';

const password = 'enrollment orders test password';
const secret = 'whsec_enrollment_orders';
const sdk = new Stripe('sk_test_fixture');
const sessions = new Map();
let providerCalls = 0;
const provider = createStripePaymentProvider({ secretKey: 'sk_test_fixture', webhookSecret: secret,
  successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel',
  stripeClient: { webhooks: sdk.webhooks, checkout: { sessions: {
    async create(input) {
      providerCalls += 1;
      const value = { id: `cs_test_${input.client_reference_id}`, object: 'checkout.session',
        livemode: false, mode: 'payment', status: 'open', payment_status: 'unpaid',
        amount_total: input.line_items[0].price_data.unit_amount, currency: 'egp',
        client_reference_id: input.client_reference_id, metadata: input.metadata,
        expires_at: input.expires_at, payment_intent: null,
        url: `https://checkout.stripe.com/c/pay/${input.client_reference_id}` };
      sessions.set(value.id, value); return value;
    },
    async retrieve(id) { providerCalls += 1; return sessions.get(id); },
  } } } });
const app = createApp({ paymentProvider: provider });
const models = [LessonProgress, Enrollment, Order, Payment, EarningEntry, WebhookEvent, Lesson, Section,
  MediaAsset, Course, Category, RefreshSession, User];
let ready = false;
before(async () => {
  await connectDatabase({ maxRetries: 1 }); assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.init())); ready = true;
});
beforeEach(async () => {
  await Promise.all(models.map(Model => Model.deleteMany({}))); sessions.clear(); providerCalls = 0;
});
after(async () => {
  try {
    if (ready && mongoose.connection.readyState === 1) await Promise.all(models.map(Model => Model.deleteMany({})));
  } finally { await disconnectDatabase(); }
});
async function actor(email, roles = ['student']) {
  const user = await User.create({ name: 'Enrollment Actor', email, roles,
    passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() });
  const { accessToken: token } = await createSessionService().login({ email, password });
  return { user, token };
}
async function fixture() {
  const student = await actor('library-student@example.test');
  const owner = await actor('library-owner@example.test', ['student', 'instructor']);
  const category = await Category.create({ name: 'Library', slug: 'library' });
  const course = await Course.create({ instructorId: owner.user.id, categoryId: category.id,
    title: 'Library Course', slug: 'library-course', priceMinor: 0, status: 'published',
    description: 'Published learning course description.', publishedAt: new Date() });
  const section = await Section.create({ courseId: course.id, title: 'First section', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'First lesson', position: 0,
    description: 'Lesson description', videoStatus: 'ready', videoAssetId: 'private-mux-id',
    videoUploadId: 'private-upload-id', attachments: [new mongoose.Types.ObjectId()] });
  return { student, owner, course, section, lesson };
}
const enroll = (id, token, application = app) => request(application).post(`/api/v1/courses/${id}/enroll`)
  .auth(token, { type: 'bearer' });
const read = (path, token, application = app) => request(application).get(`/api/v1${path}`)
  .auth(token, { type: 'bearer' });
async function pendingPurchase({ student, course }) {
  await Course.updateOne({ _id: course.id }, { $set: { priceMinor: 12345 } });
  const response = await request(app).post(`/api/v1/courses/${course.id}/checkout`)
    .auth(student.token, { type: 'bearer' }).expect(201);
  return Order.findById(response.body.data.order.id);
}
async function pay(order) {
  const raw = sessions.get(`cs_test_${order.id}`);
  Object.assign(raw, { status: 'complete', payment_status: 'paid', payment_intent: {
    id: `pi_${order.id}`, livemode: false, status: 'succeeded', amount: order.amountMinor,
    amount_received: order.amountMinor, currency: 'egp', metadata: { orderId: order.id },
  } });
  const body = JSON.stringify({ id: `evt_${order.id}`, type: 'checkout.session.completed',
    livemode: false, created: Math.floor(Date.now() / 1000), data: { object: raw } });
  await createPaymentInboxService({ provider }).receive({ rawBody: Buffer.from(body),
    signature: sdk.webhooks.generateTestHeaderString({ payload: body, secret }) });
  await app.locals.paymentWebhookWorker.processNext();
}

test('free enrollment is idempotent and concurrent-safe without financial records or provider calls', async () => {
  const { student, course } = await fixture();
  const results = await Promise.all([enroll(course.id, student.token), enroll(course.id, student.token)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
  assert.equal(results[0].body.data.enrollment.id, results[1].body.data.enrollment.id);
  assert.equal(results[0].body.data.enrollment.sourceOrderId, null);
  assert.equal(results[0].headers['cache-control'], 'no-store');
  assert.equal(await Enrollment.countDocuments(), 1);
  for (const Model of [Order, Payment, EarningEntry, WebhookEvent]) assert.equal(await Model.countDocuments(), 0);
  assert.equal(providerCalls, 0);
});

test('free enrollment validates strict inputs, current roles, verification, publication and ownership', async () => {
  const { student, owner, course } = await fixture();
  await request(app).post(`/api/v1/courses/${course.id}/enroll`).expect(401);
  await enroll('bad-id', student.token).expect(400);
  await enroll(course.id, student.token).send({ studentId: owner.user.id, priceMinor: 0 }).expect(400);
  await enroll(course.id, owner.token).expect(403);
  await Course.updateOne({ _id: course.id }, { $set: { status: 'draft' } });
  await enroll(course.id, student.token).expect(404);
  await Course.updateOne({ _id: course.id }, { $set: { status: 'published', priceMinor: 100 } });
  assert.equal((await enroll(course.id, student.token).expect(409)).body.error.code, 'PAID_COURSE_REQUIRES_CHECKOUT');
  await User.updateOne({ _id: student.user.id }, { $set: { roles: ['admin'] } });
  await enroll(course.id, student.token).expect(403);
  await User.updateOne({ _id: student.user.id }, { $set: { emailVerifiedAt: null } });
  await enroll(course.id, student.token).expect(401);
  assert.equal(await Enrollment.countDocuments(), 0);
});

test('revoked enrollment cannot be reactivated or purchased through these endpoints', async () => {
  const { student, course } = await fixture(); await enroll(course.id, student.token).expect(201);
  await Enrollment.updateOne({}, { $set: { status: 'revoked', revokedAt: new Date() } });
  assert.equal((await enroll(course.id, student.token).expect(409)).body.error.code, 'ENROLLMENT_REVOKED');
  await Course.updateOne({ _id: course.id }, { $set: { priceMinor: 100 } });
  const response = await request(app).post(`/api/v1/courses/${course.id}/checkout`)
    .auth(student.token, { type: 'bearer' }).expect(409);
  assert.equal(response.body.error.code, 'ENROLLMENT_REVOKED'); assert.equal(providerCalls, 0);
});

test('existing free access survives a price change; checkout cannot charge an enrolled student', async () => {
  const { student, course } = await fixture(); const first = await enroll(course.id, student.token).expect(201);
  await Course.updateOne({ _id: course.id }, { $set: { priceMinor: 100 } });
  const repeat = await enroll(course.id, student.token).expect(200);
  assert.deepEqual(repeat.body, first.body);
  const denied = await request(app).post(`/api/v1/courses/${course.id}/checkout`)
    .auth(student.token, { type: 'bearer' }).expect(409);
  assert.equal(denied.body.error.code, 'COURSE_ALREADY_ENROLLED');
  assert.equal(await Order.countDocuments(), 0); assert.equal(providerCalls, 0);
});

test('a pending paid slot blocks free enrollment after a price change and still fulfills financially', async () => {
  const data = await fixture(); const order = await pendingPurchase(data);
  await Course.updateOne({ _id: data.course.id }, { $set: { priceMinor: 0 } });
  const blocked = await enroll(data.course.id, data.student.token).expect(409);
  assert.equal(blocked.body.error.code, 'PAYMENT_PENDING'); assert.equal(await Enrollment.countDocuments(), 0);
  await pay(order);
  assert.equal((await Order.findById(order.id)).status, 'paid');
  const result = await enroll(data.course.id, data.student.token).expect(200);
  assert.equal(result.body.data.enrollment.sourceOrderId, order.id);
  assert.equal(await EarningEntry.countDocuments(), 1);
});

test('enrollment persistence failure rolls back reservation locks and creates no financial records', async t => {
  const { student, course } = await fixture();
  const before = await Course.findById(course.id).select('+checkoutRevision');
  t.mock.method(Enrollment, 'create', async () => { throw new Error('database password private'); });
  const response = await enroll(course.id, student.token).expect(500);
  assert.equal(JSON.stringify(response.body).includes('password'), false);
  assert.equal((await Course.findById(course.id).select('+checkoutRevision')).checkoutRevision, before.checkoutRevision);
  assert.equal(await Enrollment.countDocuments(), 0); assert.equal(await Order.countDocuments(), 0);
});

test('enrollment service rechecks active verified student inside transaction', async () => {
  const { student, course } = await fixture();
  await User.updateOne({ _id: student.user.id }, { $set: { status: 'suspended' } });
  await assert.rejects(createEnrollmentService({}).enrollFree({ studentId: student.user.id, courseId: course.id }),
    { code: 'ENROLLMENT_NOT_ALLOWED' });
  await enroll(course.id, student.token).expect(401); assert.equal(await Enrollment.countDocuments(), 0);
});

test('library is owner-scoped and paginated; learning curriculum exposes no private media or security fields', async () => {
  const { student, owner, course, lesson } = await fixture(); await enroll(course.id, student.token).expect(201);
  const list = await read('/users/me/courses?limit=1', student.token).expect(200);
  assert.equal(list.body.data.pagination.total, 1); assert.equal(list.body.data.courses[0].available, true);
  assert.equal((await read('/users/me/courses', owner.token)).body.data.pagination.total, 0);
  const details = await read(`/users/me/courses/${course.id}`, student.token).expect(200);
  assert.equal(details.body.data.course.sections[0].lessons[0].id, lesson.id);
  assert.equal(details.headers['cache-control'], 'no-store');
  const text = JSON.stringify(details.body);
  assert.deepEqual(details.body.data.course.sections[0].lessons[0].attachments, []);
  for (const privateField of ['private-mux-id', 'private-upload-id', 'passwordHash',
    'signedPlaybackId', 'checkoutRevision', 'studentId']) assert.equal(text.includes(privateField), false);
  assert.equal(details.body.data.enrollment.lastLessonId, null);
  await read(`/users/me/courses/${course.id}`, owner.token).expect(404);
  await read('/users/me/courses?studentId=other', student.token).expect(400);
});

test('unavailable or reopened drafts remain historical library entries without unreviewed content', async () => {
  const { student, course } = await fixture(); await enroll(course.id, student.token).expect(201);
  for (const status of ['unavailable', 'draft', 'rejected']) {
    await Course.updateOne({ _id: course.id }, { $set: { status, title: 'Unreviewed private draft' } });
    const library = await read('/users/me/courses', student.token).expect(200);
    assert.equal(library.body.data.courses[0].course, null);
    assert.equal(library.body.data.courses[0].available, false);
    assert.equal(JSON.stringify(library.body).includes('Unreviewed'), false);
    await read(`/users/me/courses/${course.id}`, student.token).expect(409);
  }
});

test('revoked library entries require explicit filter and cannot read curriculum; stale/foreign last lessons are hidden', async () => {
  const { student, course, lesson } = await fixture(); await enroll(course.id, student.token).expect(201);
  await Enrollment.updateOne({}, { $set: { lastLessonId: lesson.id } });
  assert.equal((await read('/users/me/courses', student.token)).body.data.courses[0].enrollment.lastLessonId, lesson.id);
  await Enrollment.updateOne({}, { $set: { lastLessonId: new mongoose.Types.ObjectId(), status: 'revoked' } });
  assert.equal((await read('/users/me/courses', student.token)).body.data.courses.length, 0);
  const revoked = await read('/users/me/courses?status=all', student.token).expect(200);
  assert.equal(revoked.body.data.courses[0].available, false);
  assert.equal(revoked.body.data.courses[0].enrollment.lastLessonId, null);
  await read(`/users/me/courses/${course.id}`, student.token).expect(404);
});

test('order history/polling use immutable snapshots, enforce ownership, and never call Stripe or fulfill', async () => {
  const data = await fixture(); const order = await pendingPurchase(data);
  const calls = providerCalls;
  await Course.updateOne({ _id: data.course.id }, { $set: { title: 'Different current title', priceMinor: 1 } });
  const result = await read(`/users/me/orders/${order.id}`, data.student.token).expect(200);
  assert.equal(result.body.data.order.courseTitle, order.courseTitleSnapshot);
  assert.equal(result.body.data.order.amountMinor, 12345); assert.equal(result.body.data.order.status, 'pending');
  assert.equal(result.body.data.payment.status, 'processing');
  for (const field of ['idempotencyKey', 'checkoutRequest', 'checkoutSessionId', 'paymentIntentId',
    'checkoutLease', 'studentId', 'commissionBps', 'instructorAmountMinor']) {
    assert.equal(JSON.stringify(result.body).includes(field), false);
  }
  await read(`/users/me/orders/${order.id}`, data.owner.token).expect(404);
  assert.equal((await read('/users/me/orders', data.owner.token)).body.data.pagination.total, 0);
  assert.equal((await read('/users/me/orders?status=pending', data.student.token)).body.data.pagination.total, 1);
  assert.equal(providerCalls, calls); assert.equal(await Enrollment.countDocuments(), 0);
  assert.equal(await EarningEntry.countDocuments(), 0);
});

test('paid fulfillment appears in library and polling, with safe admin-only financial reads', async () => {
  const data = await fixture(); const order = await pendingPurchase(data); await pay(order);
  const studentRead = await read(`/users/me/orders/${order.id}`, data.student.token).expect(200);
  assert.equal(studentRead.body.data.order.status, 'paid'); assert.equal(studentRead.body.data.payment.status, 'succeeded');
  assert.equal((await read('/users/me/courses', data.student.token)).body.data.courses[0].enrollment.sourceOrderId, order.id);
  await read(`/admin/orders/${order.id}`, data.student.token).expect(403);
  const admin = await actor('orders-admin@example.test', ['admin']);
  const detail = await read(`/admin/orders/${order.id}`, admin.token).expect(200);
  assert.equal(detail.body.data.order.studentId, data.student.user.id);
  assert.equal(detail.body.data.order.instructorAmountMinor, order.instructorAmountMinor);
  assert.equal(detail.body.data.payment.paymentIntentId, undefined);
  const list = await read(`/admin/orders?status=paid&studentId=${data.student.user.id}&courseId=${data.course.id}`, admin.token)
    .expect(200);
  assert.equal(list.body.data.pagination.total, 1);
  await read(`/admin/orders/${new mongoose.Types.ObjectId()}`, admin.token).expect(404);
});

test('all private routes require live verified sessions and reject query/parameter injection', async () => {
  const { student } = await fixture();
  for (const path of ['/users/me/courses', '/users/me/orders', '/admin/orders']) {
    const result = await request(app).get(`/api/v1${path}`).expect(401);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
  for (const path of ['/users/me/courses?limit=101', '/users/me/orders?status=bad',
    '/users/me/orders?studentId=other', '/users/me/orders?limit=1&limit=2',
    '/users/me/orders/bad-id', '/users/me/courses/bad-id']) await read(path, student.token).expect(400);
  await RefreshSession.updateMany({ userId: student.user.id }, { $set: { revokedAt: new Date() } });
  await read('/users/me/courses', student.token).expect(401);
  await read('/users/me/orders', student.token).expect(401);
});

test('free-enrollment limit is user-scoped across course IDs and fails before mutations', async () => {
  const { student, course } = await fixture(); const hits = new Map();
  const limited = createApp({ rateLimitStoreFactory: name => name !== 'enroll' ? undefined : {
    localKeys: true, async increment(key) {
      const totalHits = (hits.get(key) ?? env.ENROLL_RATE_LIMIT_MAX - 1) + 1; hits.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + 60000) };
    }, async decrement() {}, async resetKey(key) { hits.delete(key); },
  } });
  await enroll(course.id, student.token, limited).expect(201);
  const denied = await enroll(new mongoose.Types.ObjectId().toString(), student.token, limited).expect(429);
  assert.equal(denied.body.error.code, 'RATE_LIMITED'); assert.ok(denied.headers['retry-after']);
  assert.equal(await Enrollment.countDocuments(), 1);
  const other = await actor('other-library@example.test'); await enroll(course.id, other.token, limited).expect(201);
});

test('one private-read bucket spans library, order polling and admin reads for the same user', async () => {
  const admin = await actor('dual-role@example.test', ['student', 'admin']); const hits = new Map();
  const limited = createApp({ rateLimitStoreFactory: name => name !== 'private-read' ? undefined : {
    localKeys: true, async increment(key) {
      const totalHits = (hits.get(key) ?? env.PRIVATE_READ_RATE_LIMIT_MAX - 2) + 1; hits.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + 60000) };
    }, async decrement() {}, async resetKey() {},
  } });
  await read('/users/me/courses', admin.token, limited).expect(200);
  await read('/users/me/orders', admin.token, limited).expect(200);
  const denied = await read('/admin/orders', admin.token, limited).expect(429);
  assert.equal(denied.body.error.code, 'RATE_LIMITED'); assert.ok(denied.headers['retry-after']);
});

test('unavailable shared limit storage fails closed for writes and private reads with safe errors', async () => {
  const { student, course } = await fixture();
  const failed = createApp({ rateLimitStoreFactory: name => !['enroll', 'private-read'].includes(name) ? undefined : {
    localKeys: true, async increment() { throw new Error('private redis password'); },
    async decrement() {}, async resetKey() {},
  } });
  for (const operation of [enroll(course.id, student.token, failed), read('/users/me/orders', student.token, failed)]) {
    const res = await operation.expect(503); assert.equal(res.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
    assert.equal(JSON.stringify(res.body).includes('redis'), false);
  }
  assert.equal(await Enrollment.countDocuments(), 0);
});

test('order and payment reads retain one snapshot across a concurrent fulfillment', async t => {
  const data = await fixture(); const order = await pendingPurchase(data);
  const original = Payment.findOne; let changed = false;
  t.mock.method(Payment, 'findOne', function (...args) {
    const query = original.apply(this, args); const exec = query.exec;
    query.exec = async function (...values) {
      if (!changed) { changed = true; await pay(order); }
      return exec.apply(this, values);
    };
    return query;
  });
  const result = await createOrderService().getMine({ studentId: data.student.user.id, orderId: order.id });
  assert.equal(result.order.status, 'pending'); assert.equal(result.payment.status, 'processing');
  t.mock.restoreAll();
  assert.equal((await createOrderService().getMine({ studentId: data.student.user.id, orderId: order.id })).order.status, 'paid');
});

test('learning curriculum keeps published snapshot during concurrent draft edits', async t => {
  const { student, course, lesson } = await fixture(); await enroll(course.id, student.token).expect(201);
  const original = Section.find; let changed = false;
  t.mock.method(Section, 'find', function (...args) {
    const query = original.apply(this, args); const exec = query.exec;
    query.exec = async function (...values) {
      if (!changed) {
        changed = true;
        await mongoose.connection.transaction(async session => {
          await Course.updateOne({ _id: course.id }, { $set: { status: 'draft' } }, { session });
          await Lesson.updateOne({ _id: lesson.id }, { $set: { title: 'Private draft content' } }, { session });
        });
      }
      return exec.apply(this, values);
    };
    return query;
  });
  const details = await read(`/users/me/courses/${course.id}`, student.token).expect(200);
  assert.equal(details.body.data.course.sections[0].lessons[0].title, 'First lesson');
  await read(`/users/me/courses/${course.id}`, student.token).expect(409);
});

test('concurrent unpublishing before enrollment reservation cannot grant access', async t => {
  const { student, course } = await fixture(); const original = Course.findOneAndUpdate;
  let changed = false;
  t.mock.method(Course, 'findOneAndUpdate', function (...args) {
    const query = original.apply(this, args); const exec = query.exec;
    query.exec = async function (...values) {
      if (!changed) {
        changed = true;
        await Course.updateOne({ _id: course.id }, { $set: { status: 'draft' } });
      }
      return exec.apply(this, values);
    };
    return query;
  });
  await enroll(course.id, student.token).expect(404); assert.equal(await Enrollment.countDocuments(), 0);
});

test('library and order pagination are stable, filtered, and preserve missing-course/payment history', async () => {
  const data = await fixture(); await enroll(data.course.id, data.student.token).expect(201);
  const second = await Course.create({ instructorId: data.owner.user.id, categoryId: data.course.categoryId,
    title: 'Second course', slug: 'second-course', description: 'Another published course description.',
    priceMinor: 0, status: 'published' });
  await enroll(second.id, data.student.token).expect(201);
  await Enrollment.updateMany({}, { $set: { enrolledAt: new Date('2026-01-01') } });
  const first = await read('/users/me/courses?limit=1&page=1', data.student.token).expect(200);
  const next = await read('/users/me/courses?limit=1&page=2', data.student.token).expect(200);
  assert.equal(first.body.data.pagination.total, 2); assert.equal(next.body.data.pagination.totalPages, 2);
  assert.notEqual(first.body.data.courses[0].enrollment.id, next.body.data.courses[0].enrollment.id);
  await Course.deleteOne({ _id: second.id });
  const historical = await read('/users/me/courses', data.student.token).expect(200);
  assert.equal(historical.body.data.courses.find(c => c.enrollment.courseId === second.id).course, null);
  await Enrollment.deleteMany({});
  const order = await pendingPurchase(data); await Payment.deleteOne({ orderId: order.id });
  const details = await read(`/users/me/orders/${order.id}`, data.student.token).expect(200);
  assert.equal(details.body.data.payment, null);
  const empty = await read('/users/me/orders?status=paid', data.student.token).expect(200);
  assert.equal(empty.body.data.pagination.total, 0);
});

test('library validates cover ownership and last-lesson course membership before projection', async () => {
  const { student, owner, course, lesson } = await fixture(); await enroll(course.id, student.token).expect(201);
  const cover = await MediaAsset.create({ ownerId: owner.user.id, targetId: course.id,
    purpose: 'course_cover', publicId: 'library/cover', resourceType: 'image', deliveryType: 'upload',
    status: 'ready', format: 'jpg', expiresAt: new Date(), providerUploadValidUntil: new Date() });
  await Course.updateOne({ _id: course.id }, { $set: { coverAssetId: cover.id } });
  let imageCalls = 0;
  const imagesApp = createApp({ mediaProvider: { publicImageUrl({ publicId }) {
    imageCalls += 1; return `https://images.example.test/${publicId}`;
  } } });
  const image = await read('/users/me/courses', student.token, imagesApp).expect(200);
  assert.equal(image.body.data.courses[0].course.coverUrl, 'https://images.example.test/library/cover');
  await MediaAsset.updateOne({ _id: cover.id }, { $set: { status: 'deleted' } });
  const deleted = await read('/users/me/courses', student.token, imagesApp).expect(200);
  assert.equal(deleted.body.data.courses[0].course.coverUrl, null); assert.equal(imageCalls, 1);
  const otherSection = await Section.create({ courseId: new mongoose.Types.ObjectId(), title: 'Foreign section', position: 0 });
  const foreign = await Lesson.create({ sectionId: otherSection.id, title: 'Foreign lesson', position: 0 });
  await Enrollment.updateOne({}, { $set: { lastLessonId: foreign.id } });
  const list = await read('/users/me/courses', student.token).expect(200);
  assert.equal(list.body.data.courses[0].enrollment.lastLessonId, null);
  const details = await read(`/users/me/courses/${course.id}`, student.token).expect(200);
  assert.equal(details.body.data.enrollment.lastLessonId, null);
  await Enrollment.updateOne({}, { $set: { lastLessonId: lesson.id } });
  assert.equal((await read(`/users/me/courses/${course.id}`, student.token)).body.data.enrollment.lastLessonId, lesson.id);
});

test('parser errors on enrollment/private reads are safely enveloped and never cacheable', async () => {
  const { student, course } = await fixture();
  const malformed = await enroll(course.id, student.token).set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON'); assert.equal(malformed.headers['cache-control'], 'no-store');
  const privateRead = await read('/users/me/orders', student.token).set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(privateRead.headers['cache-control'], 'no-store');
});
