import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { corsOptions } from './config/cors.js';
import { logger, serializeRequest } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { healthRouter } from './modules/health/health.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(
  pinoHttp({
    logger,
    serializers: {
      req: serializeRequest,
    },
  }),
);
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use('/api/v1/health', healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);
