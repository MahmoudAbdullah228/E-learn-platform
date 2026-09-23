import bcrypt from 'bcrypt';

import { env } from '../config/env.js';
import { Category } from '../models/Category.js';
import { User } from '../models/User.js';
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
    existingAdmin.name = name;
    existingAdmin.passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    existingAdmin.roles = ['admin'];
    existingAdmin.status = 'active';
    await existingAdmin.save();
    return { admin: existingAdmin, created: false };
  }

  const admin = await User.create({
    name,
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    roles: ['admin'],
    status: 'active',
  });

  return { admin, created: true };
}

export async function seedCategories(categoryNames = defaultCategoryNames) {
  await Promise.all(
    categoryNames.map((name) =>
      Category.updateOne(
        { slug: createSlug(name) },
        { $set: { name, isActive: true } },
        { upsert: true, runValidators: true },
      ),
    ),
  );

  return Category.find({ slug: { $in: categoryNames.map(createSlug) } }).sort({ slug: 1 });
}
