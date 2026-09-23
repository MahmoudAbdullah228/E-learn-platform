import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Category } from '../src/models/Category.js';
import { User } from '../src/models/User.js';
import { defaultCategoryNames, seedAdmin, seedCategories } from '../src/services/seed.service.js';

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all([User.deleteMany({}), Category.deleteMany({})]);
  await Promise.all([User.init(), Category.init()]);
});

after(async () => {
  await mongoose.connection.db.dropDatabase();
  await disconnectDatabase();
});

test('admin seed is idempotent and stores only a password hash', async () => {
  const input = {
    name: 'Platform Admin',
    email: 'ADMIN@example.com',
    password: 'a-secure-admin-password',
  };
  const rotatedPassword = 'a-new-secure-admin-password';

  const firstResult = await seedAdmin(input);
  const secondResult = await seedAdmin({ ...input, password: rotatedPassword });
  const admins = await User.find({ email: 'admin@example.com' }).select('+passwordHash');

  assert.equal(firstResult.created, true);
  assert.equal(secondResult.created, false);
  assert.equal(admins.length, 1);
  assert.deepEqual(admins[0].roles, ['admin']);
  assert.notEqual(admins[0].passwordHash, input.password);
  assert.equal(await bcrypt.compare(input.password, admins[0].passwordHash), false);
  assert.equal(await bcrypt.compare(rotatedPassword, admins[0].passwordHash), true);

  const publicAdmin = await User.findById(admins[0].id).lean();
  assert.equal('passwordHash' in publicAdmin, false);
});

test('category seed is idempotent and preserves unique slugs', async () => {
  await seedCategories();
  await seedCategories();

  const categories = await Category.find({}).lean();
  const slugs = categories.map((category) => category.slug);

  assert.equal(categories.length, defaultCategoryNames.length);
  assert.equal(new Set(slugs).size, defaultCategoryNames.length);
  assert.equal(categories.every((category) => category.isActive), true);
});
