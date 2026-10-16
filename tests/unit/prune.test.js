import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneOptions } from '../../src/prune.js';

test('prune scopes default conservatively and explicit all maps to Engine controls', () => {
  assert.deepEqual(pruneOptions('images'), { filters: { dangling: ['true'] } });
  assert.deepEqual(pruneOptions('images', { all: true }), { filters: { dangling: ['false'] } });
  assert.deepEqual(pruneOptions('volumes'), { filters: { all: ['false'] } });
  assert.deepEqual(pruneOptions('volumes', { data: { all: true } }), { filters: { all: ['true'] } });
  const input = { filters: { label: ['cleanup=true'], 'label!': ['keep=true'], until: ['24h'] } };
  assert.deepEqual(pruneOptions('containers', input), input);
  assert.deepEqual(Object.keys(input.filters), ['label', 'label!', 'until']);
  assert.deepEqual(pruneOptions('build-cache', { all: true, keep_storage: 1024, filters: { until: ['24h'] } }), { all: true, 'keep-storage': 1024, filters: { until: ['24h'] } });
});

test('prune rejects ambiguous or misspelled options instead of broadening deletion', () => {
  for (const value of [null, [], false, { all: 'false' }, { al: true }, { filters: null }, { filters: [] }, { filters: { until: [] } }, { filters: { until: [''] } }, { filters: { until: [24] } }, { filters: { until: '24h' } }, { filters: { dangling: ['false'] } }, { data: null }, { data: {}, all: true }]) {
    assert.throws(() => pruneOptions('images', value), { statusCode: 400 });
  }
  for (const [type, options] of [['containers', { all: false }], ['volumes', { filters: { until: ['24h'] } }], ['volumes', { filters: { all: ['true'] } }], ['networks', { keep_storage: 10 }], ['build-cache', { keep_storage: -1 }], ['build-cache', { keep_storage: 0.5 }], ['build-cache', { keep_storage: Number.MAX_SAFE_INTEGER + 1 }]]) {
    assert.throws(() => pruneOptions(type, options), { statusCode: 400 });
  }
  assert.throws(() => pruneOptions('registries'), { statusCode: 404 });
  assert.throws(() => pruneOptions('__proto__'), { statusCode: 404 });
});
