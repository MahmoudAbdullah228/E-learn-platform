import mongoose from 'mongoose';

const instructorApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    bio: {
      type: String,
      required: true,
      trim: true,
      minlength: 50,
      maxlength: 2000,
    },
    expertise: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      minlength: 5,
      maxlength: 500,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

instructorApplicationSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'one_pending_application_per_user',
  },
);
instructorApplicationSchema.index({ status: 1, createdAt: -1, _id: -1 });
instructorApplicationSchema.index({ userId: 1, createdAt: -1, _id: -1 });

export const InstructorApplication = mongoose.model(
  'InstructorApplication',
  instructorApplicationSchema,
);
