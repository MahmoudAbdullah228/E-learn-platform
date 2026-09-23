import assert from 'node:assert/strict';
import test from 'node:test';

import { createSlug } from '../src/utils/slug.js';

test('createSlug preserves Arabic letters', () => {
  assert.equal(createSlug('برمجة وتطوير'), 'برمجة-وتطوير');
});

test('createSlug normalizes Latin accents and punctuation', () => {
  assert.equal(createSlug('  Développement & Design  '), 'developpement-design');
});
