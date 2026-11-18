import { protectSnapshot } from './protectSnapshot.js';

const mutationMethods = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'];
const reject = () => { throw new Error('Financial history mutation is not allowed'); };

// Application safeguards, not a substitute for restricted database credentials.
export function protectFinancialHistory(schema, { immutableFields = [], appendOnly = false } = {}) {
  if (appendOnly) {
    schema.pre(mutationMethods, reject);
    schema.pre('save', function guardAppendOnlySave() { if (!this.isNew) reject(); });
  } else {
    protectSnapshot(schema, immutableFields);
    schema.pre(mutationMethods, function validateFinancialUpdates() {
      this.setOptions({ runValidators: true });
    });
  }
  schema.pre(['deleteMany', 'findOneAndDelete'], reject);
  schema.pre('deleteOne', { document: true, query: true }, reject);
  // bulkWrite does not run ordinary update/save middleware. Financial batches are insert-only.
  schema.pre('bulkWrite', function guardFinancialBulk(operations, options) {
    if (options?.skipValidation || operations.some(operation => !operation.insertOne)) reject();
  });
}

// Null -> assigned is allowed only through an explicit compare-and-swap query.
// save(), replacements, pipelines, rename and subsequent overwrites are rejected.
export function protectWriteOnce(schema, fields) {
  schema.pre(mutationMethods, function guardWriteOnceUpdate() {
    const update = this.getUpdate();
    if (Array.isArray(update) || ['replaceOne', 'findOneAndReplace'].includes(this.op)) reject();
    const protectedPath = path => typeof path === 'string'
      && fields.some(field => path === field || path.startsWith(`${field}.`));
    for (const [operator, values] of Object.entries(update ?? {})) {
      if (!operator.startsWith('$')) { if (protectedPath(operator)) reject(); continue; }
      for (const [path, value] of Object.entries(values ?? {})) {
        if (operator === '$rename' && protectedPath(value)) reject();
        if (protectedPath(path) && (operator !== '$set' || !fields.includes(path)
            || this.getFilter()[path] !== null || value == null || this.getOptions().upsert)) reject();
      }
    }
  });
  schema.pre('save', function guardWriteOnceSave() {
    if (!this.isNew && fields.some(field => this.isModified(field))) reject();
  });
  schema.pre('bulkWrite', function guardWriteOnceBulk(operations, options) {
    if (options?.skipValidation || operations.some(operation => !operation.insertOne)) reject();
  });
}
