import mongoose from 'mongoose';

export const financialModelOptions = { timestamps: true, strict: 'throw' };
export const safeIntegerField = (minimum = 0) => ({
  type: Number, min: minimum, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger,
});
export const financialReference = (ref, required = true) => ({
  type: mongoose.Schema.Types.ObjectId, ref, required, ...(required ? {} : { default: null }),
});
export const safeCodeField = { type: String, match: /^[A-Z][A-Z0-9_]{1,79}$/ };
export const fingerprintField = { type: String, match: /^[a-f\d]{64}$/, select: false };
export const financialKeyField = {
  type: String, minlength: 16, maxlength: 128, match: /^[A-Za-z0-9_.-]+$/, select: false,
};

export function requireModelCondition(document, condition, path, message) {
  if (!condition) document.invalidate(path, message);
}
