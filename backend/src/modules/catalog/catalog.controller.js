export function createCatalogController({ catalogService }) {
  return Object.freeze({
    async list(request, response) {
      const result = await catalogService.list(request.validatedQuery);
      response.json({ data: result });
    },
    async get(request, response) {
      const course = await catalogService.getBySlug(request.validatedParams.slug);
      response.json({ data: { course } });
    },
  });
}
