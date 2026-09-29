import mongoose from 'mongoose';

import { InstructorApplication } from '../../models/InstructorApplication.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function transactionOptions(session) {
  return session ? { session } : {};
}

function toApplication(application) {
  const source = application.toObject ? application.toObject() : application;
  const user = source.userId;
  const result = {
    id: source._id.toString(),
    userId: (user?._id ?? user).toString(),
    bio: source.bio,
    expertise: source.expertise,
    status: source.status,
    reviewedBy: source.reviewedBy?.toString() ?? null,
    rejectionReason: source.rejectionReason ?? null,
    reviewedAt: source.reviewedAt ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };

  return result;
}

function applicationConflict(user) {
  if (user?.instructorStatus === 'pending') {
    return new ApiError(409, 'APPLICATION_ALREADY_PENDING',
      'An instructor application is already awaiting review');
  }
  if (user?.instructorStatus === 'approved' || user?.roles.includes('instructor')) {
    return new ApiError(409, 'INSTRUCTOR_ALREADY_APPROVED',
      'This account is already approved as an instructor');
  }
  return new ApiError(409, 'INSTRUCTOR_APPLICATION_NOT_ALLOWED',
    'This account cannot submit an instructor application');
}

async function defaultTransactionRunner(work) {
  return mongoose.connection.transaction(work);
}

export function createInstructorApplicationsService({
  runInTransaction = defaultTransactionRunner,
  clock = () => new Date(),
} = {}) {
  return Object.freeze({
    async createApplication({ userId, bio, expertise }) {
      return runInTransaction(async session => {
        const updateResult = await User.updateOne(
          {
            _id: userId,
            status: 'active',
            roles: { $all: ['student'], $nin: ['instructor'] },
            $or: [
              { instructorStatus: { $exists: false } },
              { instructorStatus: { $in: ['none', 'rejected'] } },
            ],
          },
          { $set: { instructorStatus: 'pending' } },
          transactionOptions(session),
        );

        if (updateResult.modifiedCount !== 1) {
          const user = await withSession(
            User.findById(userId).select('roles status instructorStatus'),
            session,
          );
          throw applicationConflict(user);
        }

        const [application] = await InstructorApplication.create(
          [{ userId, bio, expertise, status: 'pending' }],
          transactionOptions(session),
        );
        return toApplication(application);
      });
    },

    async getLatestApplication({ userId }) {
      const application = await InstructorApplication.findOne({ userId })
        .sort({ createdAt: -1, _id: -1 });
      return application ? toApplication(application) : null;
    },

    async listApplications({ status, page, limit }) {
      const filter = status ? { status } : {};
      const [applications, total] = await Promise.all([
        InstructorApplication.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        InstructorApplication.countDocuments(filter),
      ]);

      const users = await User.find({ _id: { $in: applications.map(item => item.userId) } })
        .select('_id name email').lean();
      const applicants = new Map(users.map(user => [user._id.toString(), {
        id: user._id.toString(), name: user.name, email: user.email,
      }]));
      return {
        applications: applications.map(application => ({
          ...toApplication(application),
          applicant: applicants.get(application.userId.toString()) ?? null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },

    async reviewApplication({ applicationId, adminUserId, status, rejectionReason }) {
      return runInTransaction(async session => {
        const reviewedAt = clock();
        const application = await withSession(
          InstructorApplication.findOneAndUpdate(
            { _id: applicationId, status: 'pending' },
            {
              $set: {
                status,
                reviewedBy: adminUserId,
                reviewedAt,
                rejectionReason: status === 'rejected' ? rejectionReason : null,
              },
            },
            { returnDocument: 'after', runValidators: true },
          ),
          session,
        );

        if (!application) {
          const existing = await withSession(
            InstructorApplication.findById(applicationId).select('status'),
            session,
          );
          if (!existing) {
            throw new ApiError(404, 'INSTRUCTOR_APPLICATION_NOT_FOUND',
              'Instructor application was not found');
          }
          throw new ApiError(409, 'APPLICATION_ALREADY_REVIEWED',
            'Instructor application has already been reviewed');
        }

        const userUpdate = status === 'approved'
          ? {
              $set: {
                instructorStatus: 'approved',
                instructorProfile: {
                  bio: application.bio,
                  expertise: application.expertise,
                },
              },
              $addToSet: { roles: 'instructor' },
            }
          : { $set: { instructorStatus: 'rejected' } };

        const userResult = await User.updateOne(
          { _id: application.userId, instructorStatus: 'pending' },
          userUpdate,
          { ...transactionOptions(session), runValidators: true },
        );
        if (userResult.matchedCount !== 1) {
          throw new ApiError(409, 'APPLICANT_STATE_CONFLICT',
            'Applicant state changed before the review completed');
        }

        return toApplication(application);
      });
    },
  });
}
