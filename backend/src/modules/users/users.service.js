import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { resolveAvatarUrl } from '../media/avatarImage.service.js';

function authenticationRequired() {
  return new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
}

async function toPublicProfile(user, mediaProvider) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    emailVerifiedAt: user.emailVerifiedAt,
    avatarAssetId: user.avatarAssetId?.toString() ?? null,
    avatarUrl: await resolveAvatarUrl({ user, mediaProvider }),
  };
}

export function createUsersService({ mediaProvider }) {
  return Object.freeze({
    async getProfile({ userId }) {
      const user = await User.findOne({ _id: userId, status: 'active' });
      if (!user) throw authenticationRequired();
      return toPublicProfile(user, mediaProvider);
    },

    async updateProfile({ userId, name }) {
      const user = await User.findOneAndUpdate(
        { _id: userId, status: 'active' },
        { $set: { name } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!user) throw authenticationRequired();
      return toPublicProfile(user, mediaProvider);
    },
  });
}
