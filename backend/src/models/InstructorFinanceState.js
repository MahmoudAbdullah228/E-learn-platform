import mongoose from 'mongoose';

import { financialModelOptions, financialReference, safeIntegerField } from './financialFields.js';
import { protectFinancialHistory } from './protectFinancialHistory.js';

const schema = new mongoose.Schema({
  instructorId: financialReference('User'),
  revision: { ...safeIntegerField(), default: 0 },
  activePayoutId: financialReference('Payout', false),
}, financialModelOptions);
protectFinancialHistory(schema, { immutableFields: ['instructorId'] });
schema.index({ instructorId: 1 }, { unique: true });
export const InstructorFinanceState = mongoose.model('InstructorFinanceState', schema);
