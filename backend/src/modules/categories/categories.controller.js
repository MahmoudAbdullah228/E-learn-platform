export function createCategoriesController({ categoriesService }) {
  return Object.freeze({
    async listPublic(request, response) {
      const result = await categoriesService.listPublic(request.validatedQuery);
      response.json({ data: result });
    },
    async listAdmin(request, response) {
      const result = await categoriesService.listAdmin(request.validatedQuery);
      response.json({ data: result });
    },
    async create(request, response) {
      const category = await categoriesService.create({ input: request.validatedBody });
      response.status(201).json({ data: { category } });
    },
    async update(request, response) {
      const category = await categoriesService.update({
        categoryId: request.validatedParams.categoryId,
        input: request.validatedBody,
      });
      response.json({ data: { category } });
    },
  });
}
