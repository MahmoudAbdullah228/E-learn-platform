export function createAuthController(authService) {
  return Object.freeze({
    async register(request, response) {
      const user = await authService.register(request.validatedBody);

      response.status(201).json({
        data: { user },
        message: 'Registration successful. Check your email to verify your account',
      });
    },

    async verifyEmail(request, response) {
      const result = await authService.verifyEmail(request.validatedBody);

      response.status(200).json({
        data: result,
        message: 'Email address verified successfully',
      });
    },

    async resendEmailVerification(request, response) {
      await authService.resendEmailVerification(request.validatedBody);

      response.status(202).json({
        data: {},
        message: 'If the account exists and still needs verification, a verification email will be sent',
      });
    },
  });
}
