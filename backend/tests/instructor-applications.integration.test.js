import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { InstructorApplication } from '../src/models/InstructorApplication.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { assertTransactionSupport } from '../src/config/transactions.js';

const password = 'correct horse battery staple';
let app;
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all([User.init(), RefreshSession.init(), InstructorApplication.init()]);
  app = createApp();
  databaseReady = true;
});

beforeEach(async () => {
  await Promise.all([
    InstructorApplication.deleteMany({}),
    RefreshSession.deleteMany({}),
    User.deleteMany({}),
  ]);
});

after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      const results = await Promise.allSettled([
        InstructorApplication.deleteMany({}),
        RefreshSession.deleteMany({}),
        User.deleteMany({}),
      ]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
  } finally {
    await disconnectDatabase();
  }
});

async function authenticatedUser({
  name = 'Application User',
  email,
  roles = ['student'],
  instructorStatus = 'none',
} = {}) {
  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    roles,
    instructorStatus,
    emailVerifiedAt: new Date(),
  });
  const session = await createSessionService().login({ email, password });
  return { user, accessToken: session.accessToken };
}

const validApplication = Object.freeze({
  bio: 'I have taught software engineering for several years and enjoy helping new developers.',
  expertise: 'Node.js, Express, MongoDB, and backend architecture',
});

async function submitApplication(accessToken, body = validApplication) {
  return request(app).post('/api/v1/instructor-applications')
    .auth(accessToken, { type: 'bearer' })
    .send(body);
}

test('instructor application endpoints enforce authentication and role authorization', async () => {
  await request(app).post('/api/v1/instructor-applications')
    .send(validApplication).expect(401);

  const admin = await authenticatedUser({
    email: 'admin-authz@example.com',
    roles: ['admin'],
  });
  const student = await authenticatedUser({ email: 'student-authz@example.com' });

  const adminApply = await submitApplication(admin.accessToken);
  assert.equal(adminApply.status, 403);
  assert.equal(adminApply.body.error.code, 'INSUFFICIENT_PERMISSIONS');

  const studentList = await request(app).get('/api/v1/admin/instructor-applications')
    .auth(student.accessToken, { type: 'bearer' });
  assert.equal(studentList.status, 403);
  assert.equal(studentList.body.error.code, 'INSUFFICIENT_PERMISSIONS');
});

test('submission validates strict text boundaries and stores one pending application', async () => {
  const { user, accessToken } = await authenticatedUser({ email: 'apply@example.com' });

  for (const body of [
    { ...validApplication, bio: 'too short' },
    { ...validApplication, expertise: 'X' },
    { ...validApplication, unexpected: true },
    { ...validApplication, bio: `${validApplication.bio}\u200B` },
  ]) {
    const response = await submitApplication(accessToken, body);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }

  const response = await submitApplication(accessToken);
  assert.equal(response.status, 201);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.data.application.userId, user.id);
  assert.equal(response.body.data.application.status, 'pending');
  assert.equal(response.body.data.application.bio, validApplication.bio);

  const storedUser = await User.findById(user.id);
  assert.equal(storedUser.instructorStatus, 'pending');
  assert.equal(await InstructorApplication.countDocuments({ userId: user.id }), 1);

  const duplicate = await submitApplication(accessToken);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'APPLICATION_ALREADY_PENDING');
  assert.equal(await InstructorApplication.countDocuments({ userId: user.id }), 1);
});

test('the partial unique index prevents two pending applications for one user', async () => {
  const { user } = await authenticatedUser({ email: 'unique-pending@example.com' });
  await InstructorApplication.create({ userId: user.id, ...validApplication });

  await assert.rejects(
    InstructorApplication.create({ userId: user.id, ...validApplication }),
    error => error?.code === 11000,
  );

  await InstructorApplication.updateOne({ userId: user.id }, {
    $set: { status: 'rejected', rejectionReason: 'Please provide more teaching evidence.' },
  });
  await InstructorApplication.create({ userId: user.id, ...validApplication });
  assert.equal(await InstructorApplication.countDocuments({ userId: user.id }), 2);
});

test('GET /instructor-applications/me returns null or the latest application', async () => {
  const { accessToken } = await authenticatedUser({ email: 'latest@example.com' });
  const empty = await request(app).get('/api/v1/instructor-applications/me')
    .auth(accessToken, { type: 'bearer' }).expect(200);
  assert.deepEqual(empty.body, { data: { application: null } });

  const first = await submitApplication(accessToken);
  await InstructorApplication.updateOne(
    { _id: first.body.data.application.id },
    { $set: { status: 'rejected', rejectionReason: 'Add more detail about your experience.' } },
  );
  await User.updateOne({ email: 'latest@example.com' }, {
    $set: { instructorStatus: 'rejected' },
  });
  const second = await submitApplication(accessToken, {
    ...validApplication,
    expertise: 'Distributed systems and database reliability',
  });

  const latest = await request(app).get('/api/v1/instructor-applications/me')
    .auth(accessToken, { type: 'bearer' }).expect(200);
  assert.equal(latest.body.data.application.id, second.body.data.application.id);
  assert.equal(latest.body.data.application.expertise,
    'Distributed systems and database reliability');
});

test('admin listing validates pagination, filters status, and returns safe applicant data', async () => {
  const admin = await authenticatedUser({
    email: 'admin-list@example.com',
    roles: ['admin'],
  });
  for (let index = 1; index <= 3; index += 1) {
    const student = await authenticatedUser({ email: `list-${index}@example.com` });
    await submitApplication(student.accessToken, {
      ...validApplication,
      expertise: `Backend engineering level ${index}`,
    });
  }
  const rejected = await InstructorApplication.findOne().sort({ createdAt: 1 });
  await InstructorApplication.updateOne({ _id: rejected.id }, {
    $set: { status: 'rejected', rejectionReason: 'More experience is required.' },
  });

  const response = await request(app)
    .get('/api/v1/admin/instructor-applications?status=pending&page=1&limit=2')
    .auth(admin.accessToken, { type: 'bearer' }).expect(200);

  assert.equal(response.body.data.applications.length, 2);
  assert.deepEqual(response.body.data.pagination, {
    page: 1,
    limit: 2,
    total: 2,
    totalPages: 1,
  });
  assert.ok(response.body.data.applications.every(application => application.status === 'pending'));
  assert.deepEqual(Object.keys(response.body.data.applications[0].applicant).sort(),
    ['email', 'id', 'name']);
  assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);

  for (const query of ['status=unknown', 'page=0', 'limit=101', 'page=1&page=2']) {
    const invalid = await request(app)
      .get(`/api/v1/admin/instructor-applications?${query}`)
      .auth(admin.accessToken, { type: 'bearer' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  }
});

test('admin approval updates the application and user while preserving the student role', async () => {
  const student = await authenticatedUser({ email: 'approve@example.com' });
  const admin = await authenticatedUser({ email: 'admin-approve@example.com', roles: ['admin'] });
  const submission = await submitApplication(student.accessToken);
  const applicationId = submission.body.data.application.id;

  const approved = await request(app)
    .patch(`/api/v1/admin/instructor-applications/${applicationId}`)
    .auth(admin.accessToken, { type: 'bearer' })
    .send({ status: 'approved' }).expect(200);

  assert.equal(approved.body.data.application.status, 'approved');
  assert.equal(approved.body.data.application.reviewedBy, admin.user.id);
  assert.ok(approved.body.data.application.reviewedAt);
  const storedUser = await User.findById(student.user.id);
  assert.equal(storedUser.instructorStatus, 'approved');
  assert.deepEqual(storedUser.roles, ['student', 'instructor']);
  assert.equal(storedUser.instructorProfile.bio, validApplication.bio);
  assert.equal(storedUser.instructorProfile.expertise, validApplication.expertise);

  const repeated = await request(app)
    .patch(`/api/v1/admin/instructor-applications/${applicationId}`)
    .auth(admin.accessToken, { type: 'bearer' })
    .send({ status: 'rejected', rejectionReason: 'This must not overwrite approval.' });
  assert.equal(repeated.status, 409);
  assert.equal(repeated.body.error.code, 'APPLICATION_ALREADY_REVIEWED');

  const reapply = await submitApplication(student.accessToken);
  assert.equal(reapply.status, 409);
  assert.equal(reapply.body.error.code, 'INSTRUCTOR_ALREADY_APPROVED');
});

test('rejection requires a reason, changes the user state, and permits a new application', async () => {
  const student = await authenticatedUser({ email: 'reject@example.com' });
  const admin = await authenticatedUser({ email: 'admin-reject@example.com', roles: ['admin'] });
  const submission = await submitApplication(student.accessToken);
  const path = `/api/v1/admin/instructor-applications/${submission.body.data.application.id}`;

  for (const body of [
    { status: 'rejected' },
    { status: 'rejected', rejectionReason: 'No' },
    { status: 'approved', rejectionReason: 'Unexpected reason' },
    { status: 'pending' },
  ]) {
    const invalid = await request(app).patch(path)
      .auth(admin.accessToken, { type: 'bearer' }).send(body);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  }

  const rejected = await request(app).patch(path)
    .auth(admin.accessToken, { type: 'bearer' })
    .send({ status: 'rejected', rejectionReason: 'Please add more teaching experience.' })
    .expect(200);
  assert.equal(rejected.body.data.application.status, 'rejected');
  assert.equal(rejected.body.data.application.rejectionReason,
    'Please add more teaching experience.');
  assert.equal((await User.findById(student.user.id)).instructorStatus, 'rejected');

  const resubmission = await submitApplication(student.accessToken);
  assert.equal(resubmission.status, 201);
  assert.equal(await InstructorApplication.countDocuments({ userId: student.user.id }), 2);
});

test('concurrent admin reviews allow exactly one pending-state transition', async () => {
  const student = await authenticatedUser({ email: 'review-race@example.com' });
  const admin = await authenticatedUser({ email: 'admin-race@example.com', roles: ['admin'] });
  const submission = await submitApplication(student.accessToken);
  const path = `/api/v1/admin/instructor-applications/${submission.body.data.application.id}`;

  const responses = await Promise.all([
    request(app).patch(path).auth(admin.accessToken, { type: 'bearer' })
      .send({ status: 'approved' }),
    request(app).patch(path).auth(admin.accessToken, { type: 'bearer' })
      .send({ status: 'rejected', rejectionReason: 'The concurrent review lost the race.' }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);

  const application = await InstructorApplication.findById(submission.body.data.application.id);
  const user = await User.findById(student.user.id);
  assert.equal(user.instructorStatus, application.status);
  assert.equal(user.roles.includes('instructor'), application.status === 'approved');
});

test('review rejects malformed ids and missing applications safely', async () => {
  const admin = await authenticatedUser({ email: 'admin-missing@example.com', roles: ['admin'] });
  const invalid = await request(app).patch('/api/v1/admin/instructor-applications/not-an-id')
    .auth(admin.accessToken, { type: 'bearer' }).send({ status: 'approved' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  const missingId = new mongoose.Types.ObjectId().toString();
  const missing = await request(app).patch(`/api/v1/admin/instructor-applications/${missingId}`)
    .auth(admin.accessToken, { type: 'bearer' }).send({ status: 'approved' });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'INSTRUCTOR_APPLICATION_NOT_FOUND');
});

test('listing retains orphaned applications without breaking the admin page', async () => {
  const student = await authenticatedUser({ email: 'deleted-applicant@example.com' });
  const admin = await authenticatedUser({ email: 'orphan-admin@example.com', roles: ['admin'] });
  const submitted = await submitApplication(student.accessToken);
  assert.equal(submitted.status, 201);
  await User.deleteOne({ _id: student.user.id });
  const response = await request(app).get('/api/v1/admin/instructor-applications')
    .auth(admin.accessToken, { type: 'bearer' }).expect(200);
  assert.equal(response.body.data.applications[0].userId, student.user.id);
  assert.equal(response.body.data.applications[0].applicant, null);
  assert.equal(response.body.data.pagination.total, 1);
});

test('failed application insertion rolls back the user transition', async context => {
  const student = await authenticatedUser({ email: 'create-rollback@example.com' });
  const insertion = context.mock.method(InstructorApplication, 'create', async () => {
    throw new Error('Simulated insertion failure');
  });
  const response = await submitApplication(student.accessToken);
  insertion.mock.restore();
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'INTERNAL_SERVER_ERROR');
  assert.equal((await User.findById(student.user.id)).instructorStatus, 'none');
  assert.equal(await InstructorApplication.countDocuments({ userId: student.user.id }), 0);
});

test('simultaneous submissions commit exactly one pending application', async () => {
  const student = await authenticatedUser({ email: 'submit-race@example.com' });
  const responses = await Promise.all([
    submitApplication(student.accessToken), submitApplication(student.accessToken),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(await InstructorApplication.countDocuments({ userId: student.user.id }), 1);
  assert.equal((await User.findById(student.user.id)).instructorStatus, 'pending');
});

test('a failed review rolls back its application update inside a MongoDB transaction', async () => {
  const student = await authenticatedUser({ email: 'rollback@example.com' });
  const admin = await authenticatedUser({ email: 'admin-rollback@example.com', roles: ['admin'] });
  const submission = await submitApplication(student.accessToken);
  const applicationId = submission.body.data.application.id;
  await User.updateOne({ _id: student.user.id }, { $set: { instructorStatus: 'rejected' } });

  const response = await request(app)
    .patch(`/api/v1/admin/instructor-applications/${applicationId}`)
    .auth(admin.accessToken, { type: 'bearer' })
    .send({ status: 'approved' });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'APPLICANT_STATE_CONFLICT');

  const application = await InstructorApplication.findById(applicationId);
  assert.equal(application.status, 'pending');
  assert.equal(application.reviewedAt, null);
  assert.equal(application.reviewedBy, null);
});
