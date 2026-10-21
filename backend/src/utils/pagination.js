import { z } from 'zod';

export const paginationFields = {
  page: z.string().regex(/^[1-9]\d*$/).default('1').transform(Number)
    .pipe(z.number().int().min(1).max(1_000_000)),
  limit: z.string().regex(/^[1-9]\d*$/).default('20').transform(Number)
    .pipe(z.number().int().min(1).max(100)),
};
export function toPagination({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
