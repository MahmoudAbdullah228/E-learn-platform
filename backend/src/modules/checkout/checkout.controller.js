export function createCheckoutController({ checkoutService }) {
  return async function checkout(request, response) {
    const result = await checkoutService.checkout({ studentId: request.auth.userId,
      courseId: request.validatedParams.courseId });
    response.status(result.created ? 201 : 200).json({ data: result.data });
  };
}
