import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { resolveAvatarUrl } from '../media/avatarImage.service.js';

function notFound() {
  return new ApiError(404, 'INSTRUCTOR_NOT_FOUND', 'Instructor profile was not found');
}

async function toInstructor(user, mediaProvider) {
  const source = user.toObject ? user.toObject() : user;
  const profile = source.instructorProfile;
  if (!profile?.bio || !profile?.expertise) throw notFound();
  return {
    id: source._id.toString(),
    name: source.name,
    avatarAssetId: source.avatarAssetId?.toString() ?? null,
    avatarUrl: await resolveAvatarUrl({ user: source, mediaProvider }),
    bio: profile.bio,
    expertise: profile.expertise,
    links: (profile.links ?? []).map(link => ({ label: link.label, url: link.url })),
  };
}

const approvedInstructor = {
  status: 'active',
  instructorStatus: 'approved',
  roles: 'instructor',
};

export function createInstructorsService({ mediaProvider }) {
  return Object.freeze({
    async getPublicProfile({ instructorId }) {
      const user = await User.findOne({ _id: instructorId, ...approvedInstructor }).lean();
      if (!user) throw notFound();
      return toInstructor(user, mediaProvider);
    },

    async updateProfile({ instructorId, input }) {
      const existing = await User.findOne({ _id: instructorId, ...approvedInstructor })
        .select('instructorProfile');
      if (!existing) throw notFound();

      if ((!existing.instructorProfile?.bio || !existing.instructorProfile?.expertise)
          && (!input.bio || !input.expertise)) {
        throw new ApiError(409, 'INSTRUCTOR_PROFILE_INCOMPLETE',
          'Bio and expertise are required to initialize the instructor profile');
      }

      const updates = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [`instructorProfile.${key}`, value]),
      );
      const user = await User.findOneAndUpdate(
        { _id: instructorId, ...approvedInstructor },
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      );
      if (!user) throw notFound();
      return toInstructor(user, mediaProvider);
    },
  });
}
