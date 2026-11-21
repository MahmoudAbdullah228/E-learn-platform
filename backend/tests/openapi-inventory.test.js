import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { parse } from 'yaml';

import { createApp } from '../src/app.js';
import { docsRouter } from '../src/modules/docs/docs.routes.js';

test('mounted product routes match the published OpenAPI operations', t => {
  const mounted = [];
  const use = express.application.use;
  t.mock.method(express.application, 'use', function (prefix, ...handlers) {
    for (const router of handlers.filter(handler => handler.stack && handler !== docsRouter)) {
      assert.equal(typeof prefix, 'string');
      assert.ok(prefix.startsWith('/api/v1'));
      for (const layer of router.stack) {
        assert.ok(!layer.handle.stack, 'Nested routers require a mount path in the inventory');
        if (!layer.route) continue;
        const path = (prefix.slice('/api/v1'.length) + layer.route.path)
          .replace(/\/$/, '').replace(/:(\w+)/g, '{$1}');
        // Express also records shared parameter validation from route.all().
        for (const method of Object.keys(layer.route.methods)) {
          if (method !== '_all') mounted.push(method + ' ' + path);
        }
      }
    }
    return use.call(this, prefix, ...handlers);
  });
  const app = createApp();
  assert.ok(!app.router.stack.some(layer => layer.route), 'Include direct app routes in the inventory');
  const contract = parse(readFileSync(new URL('../docs/openapi.yaml', import.meta.url), 'utf8'));
  const documented = Object.entries(contract.paths).flatMap(([path, item]) =>
    Object.entries(item).filter(([, operation]) => operation.responses)
      .map(([method]) => method + ' ' + path));
  assert.deepEqual(mounted.sort(), documented.sort());
});
