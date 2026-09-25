import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate.js';
import { validateBody } from '../../middlewares/validate.js';
import { createUsersController } from './users.controller.js';
import { updateProfileSchema } from './users.schemas.js';

export function createUsersRouter({ usersService }) {
  const router = Router();
  const controller = createUsersController({ usersService });

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate);
  router.get('/me', controller.getMe);
  router.patch('/me', validateBody(updateProfileSchema), controller.updateMe);

  return router;
}
