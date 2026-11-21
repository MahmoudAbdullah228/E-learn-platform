import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-dist';
import { parse } from 'yaml';

import { env } from '../../config/env.js';

const contractPath = fileURLToPath(new URL('../../../docs/openapi.yaml', import.meta.url));
let contractSource = readFileSync(contractPath, 'utf8');
let contract = parse(contractSource);
const pagePath = fileURLToPath(new URL('./index.html', import.meta.url));
const initializerPath = fileURLToPath(new URL('./swagger-init.js', import.meta.url));

export const docsRouter = Router();

docsRouter.get('/openapi.json', async (request, response) => {
  if (env.NODE_ENV === 'development') {
    const source = await readFile(contractPath, 'utf8');
    if (source !== contractSource) {
      contract = parse(source);
      contractSource = source;
    }
  }
  response.json(contract);
});
docsRouter.get('/openapi.yaml', (request, response) => {
  response.download(contractPath, 'e-learning-openapi.yaml');
});

// Keep scripts local and CSP enabled. Avoid HTTPS upgrades for local HTTP development.
docsRouter.use('/docs', helmet.contentSecurityPolicy({
  directives: {
    'upgrade-insecure-requests': env.NODE_ENV === 'production' ? [] : null,
  },
}));
docsRouter.get('/docs', (request, response, next) => {
  if (!request.path.endsWith('/')) {
    response.redirect(308, `${request.baseUrl}/docs/`);
    return;
  }
  response.sendFile(pagePath, error => { if (error) next(error); });
});
docsRouter.get('/docs/swagger-init.js', (request, response) => {
  response.sendFile(initializerPath);
});
for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
  docsRouter.get(`/docs/${asset}`, (request, response) => {
    response.sendFile(asset, { root: swaggerUi.getAbsoluteFSPath() });
  });
}
