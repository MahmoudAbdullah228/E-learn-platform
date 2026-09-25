import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    roles: {
      type: [String],
      enum: ['student', 'instructor', 'admin'],
      default: ['student'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      required: true,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
      select: false,
    },
    passwordReset: {
      type: new mongoose.Schema({
        tokenHash: String,
        expiresAt: Date,
        issuanceId: String,
        issuanceUntil: Date,
        lastIssuedAt: Date,
      }, { _id: false }),
      select: false,
    },
    passwordVersion: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'passwordReset.tokenHash': 1 }, {
  unique: true,
  partialFilterExpression: { 'passwordReset.tokenHash': { $type: 'string' } },
});

export const User = mongoose.model('User', userSchema);
