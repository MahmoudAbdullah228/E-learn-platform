import assert from 'node:assert/strict';
import test from 'node:test';

import { splitCourseRevenue } from '../src/utils/money.js';

test('revenue splits use integer arithmetic and preserve every minor unit', () => {
  for (const amount of [1, 4, 5, 12345, 99999999, Number.MAX_SAFE_INTEGER]) {
    const result = splitCourseRevenue(amount);
    assert.equal(BigInt(result.platformAmountMinor), BigInt(amount) * 2000n / 10000n);
    assert.equal(result.platformAmountMinor + result.instructorAmountMinor, amount);
  }
  assert.equal(splitCourseRevenue(1).platformAmountMinor, 0);
});

test('invalid financial amounts and commissions are rejected', () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) {
    assert.throws(() => splitCourseRevenue(amount), TypeError);
  }
  for (const commission of [-1, 10001, 0.5, '2000']) {
    assert.throws(() => splitCourseRevenue(100, commission), TypeError);
  }
});
