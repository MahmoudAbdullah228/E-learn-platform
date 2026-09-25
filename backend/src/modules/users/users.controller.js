export function createUsersController({ usersService }) {
  return Object.freeze({
    async getMe(request, response) {
      const user = await usersService.getProfile({ userId: request.auth.userId });
      response.status(200).json({ data: { user } });
    },

    async updateMe(request, response) {
      const user = await usersService.updateProfile({
        userId: request.auth.userId,
        name: request.validatedBody.name,
      });
      response.status(200).json({
        data: { user },
        message: 'Profile updated successfully',
      });
    },
  });
}
