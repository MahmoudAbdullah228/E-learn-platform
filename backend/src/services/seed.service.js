import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { Category } from '../models/Category.js';
import { User } from '../models/User.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { createSlug } from '../utils/slug.js';

export const defaultCategoryNames = Object.freeze([
  'Programming and Development',
  'Business',
  'Design',
  'Marketing',
  'Personal Development',
]);

export async function seedAdmin({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingAdmin = await User.findOne({ email: normalizedEmail });

  if (existingAdmin) {
    if (!existingAdmin.roles.includes('admin')) {
      throw new Error('Admin seed refused: email belongs to a non-admin user');
    }

    if (existingAdmin.status !== 'active') {
      throw new Error('Admin seed refused: reactivate a suspended admin through the audited status workflow');
    }
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    const now = new Date();
    return mongoose.connection.transaction(async session => {
      // Bootstrap must not undo an administrative suspension or strip other roles.
      // Password rotation invalidates old sessions/reset requests in the same transaction.
      const admin = await User.findOneAndUpdate({ _id: existingAdmin.id, roles: 'admin', status: 'active',
        $and: ['tokenVersion', 'passwordVersion'].map(field => ({ $or: [
          { [field]: { $lt: Number.MAX_SAFE_INTEGER } }, { [field]: { $exists: false } },
        ] })) }, { $set: { name, passwordHash, emailVerifiedAt: existingAdmin.emailVerifiedAt ?? now },
        $inc: { tokenVersion: 1, passwordVersion: 1 }, $unset: { passwordReset: 1 } },
      { session, returnDocument: 'after', runValidators: true });
      if (!admin) throw new Error('Admin seed refused: account state changed or requires security review');
      await RefreshSession.updateMany({ userId: admin.id, revokedAt: null },
        { $set: { revokedAt: now, revokedReason: 'password_reset' } }, { session });
      return { admin, created: false };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000 });
  }

  const admin = await User.create({
    name,
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    roles: ['admin'],
    status: 'active',
    emailVerifiedAt: new Date(),
  });

  return { admin, created: true };
}

export async function seedCategories(categoryNames = defaultCategoryNames) {
  await Promise.all(
    categoryNames.map((name) =>
      Category.updateOne(
        { slug: createSlug(name) },
        { $setOnInsert: { name, slug: createSlug(name), isActive: true } },
        { upsert: true, runValidators: true },
      ),
    ),
  );

  return Category.find({ slug: { $in: categoryNames.map(createSlug) } }).sort({ slug: 1 });
}
