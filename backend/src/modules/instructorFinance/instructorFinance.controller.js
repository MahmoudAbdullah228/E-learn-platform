export function createInstructorFinanceController(service) {
  return operation => async (request, response) => {
    const data = await service[operation]({ instructorId: request.auth.userId,
      query: request.validatedQuery, payoutId: request.validatedParams?.payoutId });
    response.json({ data });
  };
}
