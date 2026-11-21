import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';
import Stripe from 'stripe';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { AdminAuditEvent } from '../src/models/AdminAuditEvent.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { FinancialHold } from '../src/models/FinancialHold.js';
import { FinancialPolicyVersion } from '../src/models/FinancialPolicyVersion.js';
import { InstructorFinanceState } from '../src/models/InstructorFinanceState.js';
import { Lesson } from '../src/models/Lesson.js';
import { LessonProgress } from '../src/models/LessonProgress.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { Refund } from '../src/models/Refund.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { VideoAssetState } from '../src/models/VideoAssetState.js';
import { VideoPlaybackLease } from '../src/models/VideoPlaybackLease.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createPaymentInboxService } from '../src/modules/payments/paymentInbox.service.js';
import { createPaymentFulfillmentService } from '../src/modules/payments/paymentFulfillment.service.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';
import { signAccessToken } from '../src/utils/sessionToken.js';

const models = [AdminAuditEvent, Category, Course, EarningEntry, Enrollment, FinancialHold, FinancialPolicyVersion,
  InstructorFinanceState, Lesson, LessonProgress, MediaAsset, Order, Payment, Refund, RefreshSession,
  Section, User, VideoAssetState, VideoPlaybackLease, WebhookEvent];
const secret = 'whsec_repurchase'; const sdk = new Stripe('sk_test_repurchase');
const sessions = new Map(); const refunds = new Map(); let app; let ready = false;
let createCalls; let videoCalls; let downloadCalls;
const provider = createStripePaymentProvider({ secretKey: 'sk_test_repurchase', webhookSecret: secret,
  successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel', stripeClient: {
    webhooks: sdk.webhooks,
    checkout: { sessions: {
      async create(input) {
        createCalls++;
        const record = { id: `cs_test_${input.client_reference_id}`, object: 'checkout.session', livemode: false,
          mode: 'payment', status: 'open', payment_status: 'unpaid', amount_total: input.line_items[0].price_data.unit_amount,
          currency: 'egp', expires_at: input.expires_at, client_reference_id: input.client_reference_id,
          metadata: input.metadata, payment_intent: null, url: `https://checkout.stripe.com/c/pay/${input.client_reference_id}` };
        sessions.set(record.id, record); return record;
      },
      async retrieve(id) { return sessions.get(id); },
    } },
    paymentIntents: { async retrieve(id) { return [...sessions.values()].find(row => row.payment_intent?.id === id)?.payment_intent; } },
    refunds: { async retrieve(id) { return refunds.get(id); } },
  } });
before(async () => {
  await connectDatabase({ maxRetries: 1 }); assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport(); await Promise.all(models.map(Model => Model.init())); ready = true;
});
async function stop() {
  if (!app) return;
  await Promise.all(['paymentWebhookWorker', 'refundRecoveryWorker', 'refundService', 'checkoutService',
    'learningAccessService'].map(key => app.locals[key].stop()));
}
async function clear() {
  assert.ok(ready && mongoose.connection.readyState === 1); assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.collection.deleteMany({})));
}
beforeEach(async () => {
  await stop(); await clear(); sessions.clear(); refunds.clear(); createCalls = 0; videoCalls = 0; downloadCalls = 0;
  app = createApp({ paymentProvider: provider,
    videoProvider: { async ensureSignedPlaybackId() { videoCalls++; return 'signed-playback'; },
      async signPlaybackToken() { return { token: 'signed-token', expiresAt: new Date(Date.now() + 900_000) }; } },
    mediaProvider: { async createPrivateDownload() { downloadCalls++; return { url: 'https://example.test/private-file',
      expiresAt: new Date(Date.now() + 60_000) }; } },
  });
});
after(async () => {
  try { await stop(); if (ready && mongoose.connection.readyState === 1) await clear(); }
  finally { await disconnectDatabase(); }
});
async function actor(roles = ['student']) {
  const user = await User.create({ name: 'Repurchase actor', email: `${randomUUID()}@example.test`, roles,
    passwordHash: 'unused-test-hash', emailVerifiedAt: new Date() });
  const familyId = randomUUID();
  await RefreshSession.create({ userId: user.id, familyId, tokenHash: randomUUID(), tokenVersion: 0,
    expiresAt: new Date(Date.now() + 86400_000) });
  return { user, token: await signAccessToken({ userId: user.id, roles, familyId, tokenVersion: 0 }) };
}
const read = (f, path) => request(app).get(`/api/v1${path}`).auth(f.student.token, { type: 'bearer' });
const buy = f => request(app).post(`/api/v1/courses/${f.course.id}/checkout`).auth(f.student.token, { type: 'bearer' });
const free = f => request(app).post(`/api/v1/courses/${f.course.id}/enroll`).auth(f.student.token, { type: 'bearer' });
const learningPath = f => `/users/me/courses/${f.course.id}`;
const completion = (f, lesson = f.lesson) => request(app).put(`/api/v1/users/me/courses/${f.course.id}/lessons/${lesson.id}/progress`)
  .auth(f.student.token, { type: 'bearer' }).send({ completed: true });
async function receive(raw, type, id = `evt_${randomUUID().replaceAll('-', '')}`) {
  const body = JSON.stringify({ id, type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object: raw } });
  await createPaymentInboxService({ provider }).receive({ rawBody: Buffer.from(body),
    signature: sdk.webhooks.generateTestHeaderString({ payload: body, secret }) }); return id;
}
async function pay(orderId, eventId) {
  const row = sessions.get(`cs_test_${orderId}`);
  Object.assign(row, { status: 'complete', payment_status: 'paid', payment_intent: { id: `pi_${orderId}`,
    livemode: false, status: 'succeeded', amount: row.amount_total, amount_received: row.amount_total, currency: 'egp', metadata: row.metadata } });
  const id = await receive(row, 'checkout.session.completed', eventId); await app.locals.paymentWebhookWorker.processNext();
  assert.equal((await WebhookEvent.findOne({ eventId: id })).status, 'processed'); return id;
}
async function refund(orderId, status = 'succeeded', suffix = '') {
  const row = sessions.get(`cs_test_${orderId}`);
  const raw = refunds.get(`re_${orderId}${suffix}`) ?? { object: 'refund', id: `re_${orderId}${suffix}`, payment_intent: row.payment_intent.id,
    amount: row.amount_total, currency: 'egp', created: Math.floor(Date.now() / 1000), status, metadata: {} };
  raw.status = status;
  refunds.set(raw.id, raw);
  const id = await receive(raw, 'refund.updated'); await app.locals.paymentWebhookWorker.processNext();
  assert.equal((await WebhookEvent.findOne({ eventId: id })).status, 'processed'); return raw;
}
async function fixture({ refunded = true } = {}) {
  const instructor = await actor(['student', 'instructor']); const student = await actor();
  const category = await Category.create({ name: 'Repurchase', slug: 'repurchase' });
  const course = await Course.create({ instructorId: instructor.user.id, categoryId: category.id, title: 'Repurchase course',
    slug: 'repurchase-course', description: 'Course used for refund and repurchase integration.', status: 'published', priceMinor: 1000 });
  const section = await Section.create({ courseId: course.id, title: 'First section', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'First lesson', position: 0, videoStatus: 'ready', videoAssetId: 'video-private' });
  const asset = await MediaAsset.create({ ownerId: instructor.user.id, purpose: 'lesson_attachment', targetId: lesson.id,
    publicId: 'private/lesson.pdf', resourceType: 'raw', deliveryType: 'authenticated', status: 'ready', format: 'pdf',
    expiresAt: new Date(), providerUploadValidUntil: new Date() });
  await Lesson.updateOne({ _id: lesson.id }, { $set: { attachments: [asset.id] } });
  const f = { instructor, student, course, section, lesson, asset };
  const created = await buy(f).expect(201); f.orderId = created.body.data.order.id; await pay(f.orderId);
  await completion(f).expect(200);
  await request(app).put(`/api/v1/users/me/courses/${course.id}/last-lesson`).auth(student.token, { type: 'bearer' }).send({ lessonId: lesson.id }).expect(200);
  f.enrollment = await Enrollment.findOne({ studentId: student.user.id, courseId: course.id });
  if (refunded) f.refund = await refund(f.orderId);
  return f;
}
test('full refund denies new credentials/progress and owned reads explain refund status without exposing provider or private reasons', async () => {
  const f = await fixture();
  await read(f, learningPath(f)).expect(404);
  await read(f, `/lessons/${f.lesson.id}/playback`).expect(403);
  await read(f, `/lessons/${f.lesson.id}/attachments/${f.asset.id}/download`).expect(403);
  await completion(f).expect(404); assert.equal(videoCalls, 0); assert.equal(downloadCalls, 0);
  const library = await read(f, '/users/me/courses?status=all').expect(200);
  assert.equal(library.body.data.courses[0].availabilityCode, 'ENROLLMENT_REFUNDED');
  assert.equal(library.body.data.courses[0].enrollment.revocationReason, 'refund');
  const detail = await read(f, `/users/me/orders/${f.orderId}`).expect(200);
  assert.equal(detail.body.data.order.latestRefund.status, 'succeeded');
  assert.equal(detail.body.data.order.latestRefund.kind, 'full');
  for (const secretField of ['providerRefundId', 'paymentIntentId', 'replacesOrderId', 'idempotencyKey', 'initiatedBy', 'reason']) {
    assert.equal(JSON.stringify(detail.body).includes(`"${secretField}"`), false);
  }
  const other = await actor(); await request(app).get(`/api/v1/users/me/orders/${f.orderId}`).auth(other.token, { type: 'bearer' }).expect(404);
});
test('paid repurchase reuses enrollment/progress identity, recalculates current curriculum and grants only after trusted payment', async () => {
  const f = await fixture(); const progressBefore = await LessonProgress.findOne();
  const added = await Lesson.create({ sectionId: f.section.id, title: 'New published lesson', position: 1 });
  const response = await buy(f).expect(201); const newId = response.body.data.order.id;
  assert.notEqual(newId, f.orderId); assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'revoked');
  assert.equal(String((await Order.findById(newId).select('+replacesOrderId')).replacesOrderId), f.orderId);
  await read(f, `/lessons/${f.lesson.id}/playback`).expect(403); await pay(newId);
  const enrollment = await Enrollment.findById(f.enrollment.id);
  assert.equal(enrollment.status, 'active'); assert.equal(String(enrollment.sourceOrderId), newId);
  assert.equal(enrollment.revocationReason, null); assert.equal(enrollment.revocationSourceOrderId, null); assert.equal(enrollment.revokedAt, null);
  assert.equal(enrollment.completedAt, null); assert.equal(String(enrollment.lastLessonId), f.lesson.id);
  assert.equal((await LessonProgress.findOne()).id, progressBefore.id);
  assert.equal((await LessonProgress.findOne()).completedAt.getTime(), progressBefore.completedAt.getTime());
  const learning = await read(f, learningPath(f)).expect(200);
  assert.deepEqual(learning.body.data.progress, { totalLessons: 2, completedLessons: 1, percentage: 50, completedAt: null });
  await read(f, `/lessons/${f.lesson.id}/playback`).expect(200);
  await read(f, `/lessons/${f.lesson.id}/attachments/${f.asset.id}/download`).expect(200);
  await completion(f, added).expect(200);
  assert.equal((await read(f, learningPath(f))).body.data.progress.percentage, 100);
  assert.equal(await Enrollment.countDocuments(), 1); assert.equal(await EarningEntry.countDocuments({ type: 'sale' }), 2);
  assert.equal((await EarningEntry.findOne({ orderId: f.orderId })).status, 'reversed');
});
test('concurrent repurchase reservations and duplicate payment events produce one current purchase, enrollment and new sale', async () => {
  const f = await fixture(); const results = await Promise.all([buy(f), buy(f)]);
  assert.ok(results.every(result => [200, 201, 409].includes(result.status)));
  assert.equal(results.filter(result => result.status === 201).length, 1); assert.equal(createCalls, 2);
  const current = await Order.findOne({ status: 'pending' }); await pay(current.id);
  await Promise.all([receive(sessions.get(`cs_test_${current.id}`), 'checkout.session.completed'),
    receive(sessions.get(`cs_test_${current.id}`), 'checkout.session.completed')]);
  await Promise.all([app.locals.paymentWebhookWorker.processNext(), app.locals.paymentWebhookWorker.processNext()]);
  await app.locals.paymentWebhookWorker.processNext();
  assert.equal(await Order.countDocuments({ purchaseSlotActive: true }), 1); assert.equal(await Enrollment.countDocuments(), 1);
  assert.equal(await EarningEntry.countDocuments({ orderId: current.id }), 1); await buy(f).expect(409);
});
test('late old refund and checkout events cannot revoke or rebind a new paid entitlement', async () => {
  const f = await fixture(); const replacement = await buy(f).expect(201); const newId = replacement.body.data.order.id; await pay(newId);
  await refund(f.orderId); await pay(f.orderId);
  const enrollment = await Enrollment.findById(f.enrollment.id);
  assert.equal(enrollment.status, 'active'); assert.equal(String(enrollment.sourceOrderId), newId);
  assert.equal(await Refund.countDocuments(), 1); assert.equal(await Enrollment.countDocuments(), 1);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 0);
  assert.equal(await EarningEntry.countDocuments(), 2); await read(f, learningPath(f)).expect(200);
});
test('now-free reactivation is concurrent-safe with no synthetic order/payment/sale and old events preserve the free source', async () => {
  const f = await fixture(); await Course.updateOne({ _id: f.course.id }, { $set: { priceMinor: 0 } });
  await Lesson.create({ sectionId: f.section.id, title: 'Added lesson', position: 1 });
  const results = await Promise.all([free(f), free(f)]); assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.ok(results.every(result => result.body.data.enrollment.id === f.enrollment.id));
  assert.ok(results.every(result => result.body.data.enrollment.completedAt === null));
  await refund(f.orderId); await pay(f.orderId);
  const enrollment = await Enrollment.findById(f.enrollment.id);
  assert.equal(enrollment.status, 'active'); assert.equal(enrollment.sourceOrderId, null);
  assert.equal(await Order.countDocuments(), 1); assert.equal(await Payment.countDocuments(), 1);
  assert.equal(await EarningEntry.countDocuments(), 1); assert.equal(createCalls, 1);
  assert.equal((await read(f, learningPath(f))).body.data.progress.percentage, 50);
});
test('a pending paid repurchase blocks a price-change free reactivation until confirmed unpaid expiration', async () => {
  const f = await fixture(); const attempt = await buy(f).expect(201);
  await Course.updateOne({ _id: f.course.id }, { $set: { priceMinor: 0 } });
  assert.equal((await free(f).expect(409)).body.error.code, 'PAYMENT_PENDING');
  const row = sessions.get(`cs_test_${attempt.body.data.order.id}`); row.status = 'expired';
  await receive(row, 'checkout.session.expired'); await app.locals.paymentWebhookWorker.processNext();
  assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'revoked');
  assert.equal(await EarningEntry.countDocuments(), 1);
  await free(f).expect(200); assert.equal((await Enrollment.findById(f.enrollment.id)).sourceOrderId, null);
});
test('independent or legacy enrollment revocations cannot be bypassed through paid or free reentry', async () => {
  const f = await fixture();
  for (const reason of ['admin', 'legal', 'security', null]) {
    await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: { revocationReason: reason } });
    assert.equal((await buy(f).expect(409)).body.error.code, 'ENROLLMENT_REVOKED');
    await Course.updateOne({ _id: f.course.id }, { $set: { priceMinor: 0 } });
    assert.equal((await free(f).expect(409)).body.error.code, 'ENROLLMENT_REVOKED');
    const library = await read(f, '/users/me/courses?status=all');
    assert.equal(library.body.data.courses[0].enrollment.revocationReason, 'restricted');
    await Course.updateOne({ _id: f.course.id }, { $set: { priceMinor: 1000 } });
  }
  assert.equal(createCalls, 1); assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'revoked');
});
test('a legal revocation imposed after Checkout survives genuine payment without losing receipt accounting', async () => {
  const f = await fixture(); const attempt = await buy(f).expect(201); const newId = attempt.body.data.order.id;
  await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: { revocationReason: 'legal' } });
  await pay(newId); const enrollment = await Enrollment.findById(f.enrollment.id);
  assert.equal(enrollment.status, 'revoked'); assert.equal(enrollment.revocationReason, 'legal');
  assert.equal(String(enrollment.sourceOrderId), newId); assert.equal((await Order.findById(newId)).status, 'paid');
  assert.equal(await EarningEntry.countDocuments({ orderId: newId }), 1);
  await read(f, `/lessons/${f.lesson.id}/playback`).expect(403); await completion(f).expect(404);
});

test('successive refund/repurchase cycles advance only the current source and retain all financial history', async () => {
  const f = await fixture(); const second = await buy(f).expect(201); const secondId = second.body.data.order.id; await pay(secondId);
  await refund(secondId);
  assert.equal(String((await Enrollment.findById(f.enrollment.id)).revocationSourceOrderId), secondId);
  const third = await buy(f).expect(201); const thirdId = third.body.data.order.id; await pay(thirdId);
  assert.equal(String((await Order.findById(thirdId).select('+replacesOrderId')).replacesOrderId), secondId);
  await refund(f.orderId); await refund(secondId); const enrollment = await Enrollment.findById(f.enrollment.id);
  assert.equal(enrollment.status, 'active'); assert.equal(String(enrollment.sourceOrderId), thirdId);
  assert.equal(await Enrollment.countDocuments(), 1); assert.equal(await Order.countDocuments(), 3);
  assert.equal(await Refund.countDocuments({ status: 'succeeded' }), 2);
  assert.equal(await EarningEntry.countDocuments({ status: 'reversed' }), 2);
  assert.equal(await EarningEntry.countDocuments({ status: 'pending' }), 1);
});

test('a course archived after a repurchase reservation still accounts confirmed payment and retains learner access', async () => {
  const f = await fixture(); const next = await buy(f).expect(201);
  await Course.updateOne({ _id: f.course.id }, { $set: { status: 'archived', archivedAt: new Date() } });
  await pay(next.body.data.order.id); const learning = await read(f, learningPath(f)).expect(200);
  assert.equal(learning.body.data.course.status, 'archived'); await read(f, `/lessons/${f.lesson.id}/playback`).expect(200);
  assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'active');
});
test('pending/failed/canceled/partial refunds do not permit another purchase or disrupt existing access', async () => {
  for (const status of ['pending', 'failed', 'canceled', 'partial']) {
    await clear(); sessions.clear(); refunds.clear(); createCalls = 0;
    const f = await fixture({ refunded: false });
    if (status === 'partial') {
      const raw = { object: 'refund', id: `re_${f.orderId}`, payment_intent: `pi_${f.orderId}`, amount: 300,
        currency: 'egp', created: Math.floor(Date.now() / 1000), status: 'succeeded', metadata: {} };
      refunds.set(raw.id, raw); await receive(raw, 'refund.updated'); await app.locals.paymentWebhookWorker.processNext();
    } else await refund(f.orderId, status);
    assert.equal((await buy(f).expect(409)).body.error.code, 'COURSE_ALREADY_ENROLLED');
    await read(f, learningPath(f)).expect(200); await read(f, `/lessons/${f.lesson.id}/playback`).expect(200);
    const detail = await read(f, `/users/me/orders/${f.orderId}`);
    assert.equal(detail.body.data.order.status, 'paid'); assert.equal(detail.body.data.order.latestRefund.kind, status === 'partial' ? 'partial' : 'full');
    assert.equal(detail.body.data.order.latestRefund.status, { pending: 'pending', failed: 'failed', canceled: 'cancelled', partial: 'requires_reconciliation' }[status]);
  }
});
test('forged refund revocation without completed financial proof fails closed', async () => {
  const f = await fixture({ refunded: false });
  await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: { status: 'revoked', revocationReason: 'refund',
    revocationSourceOrderId: f.orderId, revokedAt: new Date() } });
  await buy(f).expect(409); await Course.updateOne({ _id: f.course.id }, { $set: { priceMinor: 0 } });
  await free(f).expect(409); assert.equal(createCalls, 1); assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'revoked');
});
test('archived, blocked, unavailable or suspended contexts refuse new reentry', async () => {
  const f = await fixture();
  for (const patch of [{ status: 'archived' }, { accessStatus: 'blocked' }, { unavailableAt: new Date() }]) {
    await Course.updateOne({ _id: f.course.id }, { $set: patch }); await buy(f).expect(404);
    await Course.updateOne({ _id: f.course.id }, { $set: { priceMinor: 0 } }); await free(f).expect(404);
    await Course.updateOne({ _id: f.course.id }, { $set: { status: 'published', accessStatus: 'available', unavailableAt: null, priceMinor: 1000 } });
  }
  await User.updateOne({ _id: f.student.user.id }, { $set: { status: 'suspended' } }); await buy(f).expect(401); await free(f).expect(401);
  assert.equal(createCalls, 1);
});
test('deleted/foreign resume lessons are cleared while unrelated historical completion records remain retained', async () => {
  const f = await fixture(); await Lesson.deleteOne({ _id: f.lesson.id });
  const another = await Lesson.create({ sectionId: f.section.id, title: 'Replacement lesson', position: 0 });
  const attempt = await buy(f).expect(201); await pay(attempt.body.data.order.id);
  const current = await Enrollment.findById(f.enrollment.id);
  assert.equal(current.lastLessonId, null); assert.equal(current.completedAt, null);
  assert.equal(await LessonProgress.countDocuments({ enrollmentId: current.id }), 1);
  const learning = await read(f, learningPath(f)); assert.equal(learning.body.data.progress.completedLessons, 0);
  assert.equal(learning.body.data.progress.totalLessons, 1); assert.equal(learning.body.data.course.sections[0].lessons[0].id, another.id);
});
test('replacement source is server-only, immutable and absent from DTOs; all existing input schemas remain strict', async () => {
  const f = await fixture();
  await buy(f).send({ replacesOrderId: f.orderId }).expect(400); await free(f).send({ reactivate: true }).expect(400);
  const attempt = await buy(f).expect(201); const id = attempt.body.data.order.id;
  await assert.rejects(Order.updateOne({ _id: id }, { $set: { replacesOrderId: new mongoose.Types.ObjectId() } }));
  assert.equal((await Order.findById(id)).replacesOrderId, undefined);
  assert.equal(JSON.stringify(attempt.body).includes('replacesOrderId'), false);
});
test('reactivation and financial fulfillment roll back together when the inbox lease expires at completion', async () => {
  const f = await fixture(); const attempt = await buy(f).expect(201); const id = attempt.body.data.order.id;
  const row = sessions.get(`cs_test_${id}`);
  Object.assign(row, { status: 'complete', payment_status: 'paid', payment_intent: { id: `pi_${id}`, livemode: false,
    status: 'succeeded', amount: 1000, amount_received: 1000, currency: 'egp', metadata: row.metadata } });
  const eventId = await receive(row, 'checkout.session.completed'); const now = new Date(); let reads = 0;
  const job = await WebhookEvent.findOneAndUpdate({ eventId }, { $set: { status: 'processing', leaseId: 'test-lease',
    leaseUntil: new Date(now.getTime() + 1000) } }, { returnDocument: 'after' }).select('+payload +leaseId');
  const fulfillment = createPaymentFulfillmentService({ clock: () => new Date(now.getTime() + (++reads >= 3 ? 2000 : 0)) });
  await assert.rejects(fulfillment.fulfill({ job, current: await provider.retrieveCheckoutSession(row.id) }), { code: 'PAYMENT_EVENT_LEASE_LOST' });
  assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'revoked');
  assert.equal((await Order.findById(id)).status, 'pending'); assert.equal(await EarningEntry.countDocuments({ orderId: id }), 0);
});
