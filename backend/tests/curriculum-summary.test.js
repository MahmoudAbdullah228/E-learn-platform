import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeCurriculum } from '../src/modules/catalog/curriculumSummary.js';

const ready = durationSeconds => ({ videoStatus: 'ready', durationSeconds });

test('curriculum summary counts empty sections and sums confirmed durations exactly', () => {
  assert.deepEqual(summarizeCurriculum({ sections: [{}, {}], lessons: [ready(120), ready(45)] }), {
    sectionCount: 2, lessonCount: 2, totalDurationSeconds: 165, unknownDurationCount: 0,
  });
  assert.deepEqual(summarizeCurriculum({ sections: [], lessons: [] }), {
    sectionCount: 0, lessonCount: 0, totalDurationSeconds: 0, unknownDurationCount: 0,
  });
});

test('curriculum summary never presents a partial sum as a complete course duration', () => {
  const unknown = [undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
  for (const value of unknown) {
    const summary = summarizeCurriculum({ sections: [{}], lessons: [ready(120), ready(value)] });
    assert.equal(summary.totalDurationSeconds, null);
    assert.equal(summary.unknownDurationCount, 1);
  }
  assert.equal(summarizeCurriculum({ sections: [{}],
    lessons: [{ videoStatus: 'pending', durationSeconds: 120 }] }).totalDurationSeconds, null);
});

test('curriculum duration does not round or overflow safe JSON integers', () => {
  assert.equal(summarizeCurriculum({ sections: [{}],
    lessons: [ready(Number.MAX_SAFE_INTEGER)] }).totalDurationSeconds, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(summarizeCurriculum({ sections: [{}],
    lessons: [ready(Number.MAX_SAFE_INTEGER), ready(1)] }), {
    sectionCount: 1, lessonCount: 2, totalDurationSeconds: null, unknownDurationCount: 0,
  });
});
