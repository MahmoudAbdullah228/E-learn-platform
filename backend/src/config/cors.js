import { env } from './env.js';
import { ApiError } from '../utils/ApiError.js';

export const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new ApiError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed'));
  },
};
