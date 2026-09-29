import { z } from 'zod';

export const emptyUploadBodySchema = z.object({}).strict().optional().transform(() => ({}));
