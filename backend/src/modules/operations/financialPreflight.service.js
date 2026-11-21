import { isDeepStrictEqual } from 'node:util';

import { EarningEntry } from '../../models/EarningEntry.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { InstructorFinanceState } from '../../models/InstructorFinanceState.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Payout } from '../../models/Payout.js';
import { PayoutItem } from '../../models/PayoutItem.js';
import { Refund } from '../../models/Refund.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { AdminAuditEvent } from '../../models/AdminAuditEvent.js';

const models = [Order, Payment, Refund, EarningEntry, Payout, PayoutItem, FinancialHold, InstructorFinanceState,
  WebhookEvent, AdminAuditEvent];
const options = { maxTimeMS: 30000, allowDiskUse: true };
async function count(model, stages) {
  const [result] = await model.collection.aggregate([...stages, { $count: 'n' }], options).toArray();
  return result?.n ?? 0;
}

export async function duplicateGroups() {
  const result = {};
  for (const model of models) {
    for (const [keys, index] of model.schema.indexes()) {
      if (!index.unique) continue;
      const id = Object.fromEntries(Object.keys(keys).map(key => [key, { $ifNull: ['$' + key, null] }]));
      result[model.modelName + '.' + Object.keys(keys).join('+')] = await count(model, [
        { $match: index.partialFilterExpression ?? {} },
        { $group: { _id: id, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } },
      ]);
    }
  }
  return result;
}

export async function checkFinancialData() {
  const duplicates = await duplicateGroups(), unsafe = {}, orphans = {};
  for (const [model, fields] of [[Order, ['amountMinor', 'platformAmountMinor', 'instructorAmountMinor']],
    [Payment, ['amountMinor']], [Refund, ['amountMinor', 'paymentAmountMinor']], [EarningEntry, ['amountMinor']],
    [PayoutItem, ['amountMinor']], [Payout, ['amountMinor']]]) {
    const ledger = model === EarningEntry || model === PayoutItem;
    const invalid = fields.map(key => {
      const value = '$' + key;
      return { $not: [{ $and: [{ $isNumber: value }, { $lte: [value, Number.MAX_SAFE_INTEGER] },
        { $gte: [value, ledger ? -Number.MAX_SAFE_INTEGER : key === 'amountMinor' || key === 'paymentAmountMinor' ? 1 : 0] },
        { $eq: [value, { $convert: { input: value, to: 'long', onError: null, onNull: null } }] }] }] };
    });
    if (ledger) invalid.push({ $or: [
      { $and: [{ $eq: ['$type', 'sale'] }, { $lt: ['$amountMinor', 0] }] },
      { $and: [{ $eq: ['$type', 'refund_adjustment'] }, { $gte: ['$amountMinor', 0] }] },
    ] });
    unsafe[model.modelName] = await count(model, [{ $match: { $expr: { $or: invalid } } }]);
  }
  for (const [model, key, from] of [[Payment, 'orderId', 'orders'], [Refund, 'paymentId', 'payments'],
    [EarningEntry, 'orderId', 'orders'], [EarningEntry, 'instructorId', 'users'],
    [PayoutItem, 'payoutId', 'payouts'], [Payout, 'instructorId', 'users']]) {
    orphans[model.modelName + '.' + key] = await count(model, [
      { $lookup: { from, localField: key, foreignField: '_id', pipeline: [{ $project: { _id: 1 } }], as: 'parent' } },
      { $match: { 'parent.0': { $exists: false } } },
    ]);
  }
  return { duplicates, unsafe, orphans, blocked: [duplicates, unsafe, orphans].some(group => Object.values(group).some(Boolean)) };
}

async function indexDifferences() {
  const missing = [], conflicts = [];
  for (const model of models) {
    let existing;
    try { existing = await model.collection.indexes(); }
    catch (error) { if (error.code !== 26) throw error; existing = []; }
    for (const [keys, index] of model.schema.indexes()) {
      const found = existing.find(item => isDeepStrictEqual(Object.entries(item.key), Object.entries(keys)));
      if (!found) missing.push({ model, keys, index });
      else if (Boolean(found.unique) !== Boolean(index.unique)
          || !isDeepStrictEqual(found.partialFilterExpression ?? null, index.partialFilterExpression ?? null)
          || Boolean(found.sparse) !== Boolean(index.sparse)) conflicts.push(model.modelName + '.' + Object.keys(keys).join('+'));
    }
  }
  return { missing, conflicts };
}

export async function requiredUniqueIndexesReady() {
  const { missing, conflicts } = await indexDifferences();
  return !conflicts.length && !missing.some(item => item.index.unique);
}

export async function financialIndexes({ apply }) {
  const data = await checkFinancialData();
  if (data.blocked) return data;
  const { missing, conflicts } = await indexDifferences();
  if (apply && !conflicts.length) {
    for (const { model, keys, index } of missing) await model.collection.createIndex(keys, index);
  }
  return { blocked: Boolean(conflicts.length), conflicts, missingBefore: missing.length,
    created: apply && !conflicts.length ? missing.length : 0 };
}
