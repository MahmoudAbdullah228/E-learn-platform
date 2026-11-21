import mongoose from 'mongoose';

import { protectFinancialHistory } from './protectFinancialHistory.js';
import { safeIntegerField } from './financialFields.js';

export const ADMIN_SECURITY_STATE_ID = 'admin-users';
const schema = new mongoose.Schema({
  _id: { type: String, enum: [ADMIN_SECURITY_STATE_ID], required: true },
  revision: { ...safeIntegerField(), default: 0 },
}, { timestamps: true, strict: 'throw' });
// A conflict document, never a cached admin count. Count current usable admins in the
// transaction. Future role-removal/deletion commands must acquire this same guard.
protectFinancialHistory(schema, { immutableFields: ['_id'] });
export const AdminSecurityState = mongoose.model('AdminSecurityState', schema);
