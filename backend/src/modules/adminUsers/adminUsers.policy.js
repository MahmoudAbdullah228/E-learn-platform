import { ApiError } from '../../utils/ApiError.js';

export function assertUserStatusChange({ actorId, user, status, activeAdminCount }) {
  if (status !== 'suspended') return;
  if (String(user._id) === actorId) {
    throw new ApiError(409, 'SELF_SUSPENSION_NOT_ALLOWED', 'You cannot suspend your own account');
  }
  if (user.status === 'active' && user.emailVerifiedAt && user.roles.includes('admin')
      && activeAdminCount <= 1) {
    throw new ApiError(409, 'LAST_ACTIVE_ADMIN', 'At least one verified active administrator must remain');
  }
}
