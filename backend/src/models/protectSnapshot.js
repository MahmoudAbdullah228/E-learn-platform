// Mongoose's immutable casting alone does not reliably protect dotted subdocument updates.
export function protectSnapshot(schema, fields) {
  const isProtected = path => fields.some(field => path === field || path.startsWith(`${field}.`));
  const reject = () => { throw new Error('Financial snapshots cannot be modified'); };
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'],
    function guardSnapshotUpdate() {
      const update = this.getUpdate();
      if (Array.isArray(update) || this.op === 'replaceOne' || this.op === 'findOneAndReplace') {
        reject();
      }
      for (const [operator, values] of Object.entries(update ?? {})) {
        if (!operator.startsWith('$')) {
          if (isProtected(operator)) reject();
          continue;
        }
        for (const path of Object.keys(values ?? {})) {
          if (isProtected(path) || (operator === '$rename' && isProtected(values[path]))) reject();
        }
      }
    });
  schema.pre('save', function guardSnapshotSave() {
    if (!this.isNew && fields.some(field => this.isModified(field))) reject();
  });
}
