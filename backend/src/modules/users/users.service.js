import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';

function authenticationRequired() {
  return new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
}

function toPublicProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

export function createUsersService() {
  return Object.freeze({
    async getProfile({ userId }) {
      const user = await User.findOne({ _id: userId, status: 'active' });
      if (!user) throw authenticationRequired();
      return toPublicProfile(user);
    },

    async updateProfile({ userId, name }) {
      const user = await User.findOneAndUpdate(
        { _id: userId, status: 'active' },
        { $set: { name } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!user) throw authenticationRequired();
      return toPublicProfile(user);
    },
  });
}
