export const adminUserProjection = '_id name email roles status instructorStatus createdAt updatedAt +statusRevision';

export function toAdminUser(user, { detail = false } = {}) {
  return {
    id: String(user._id), name: user.name, email: user.email, roles: [...user.roles],
    status: user.status, instructorStatus: user.instructorStatus,
    revision: user.statusRevision ?? 0,
    ...(detail ? { createdAt: user.createdAt, updatedAt: user.updatedAt } : {}),
  };
}
