import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup(rows, { failPage = -1, cap = 1000 } = {}) {
  const source = fs.readFileSync('src/app/actions.ts', 'utf8');
  const action = source.slice(source.indexOf('export async function getHistoricalGlucoseAction('), source.indexOf('export async function getMonitorGlucoseDayAction('));
  const calls = [];
  const cache = new Map();
  const context = {
    exports: {}, Date, JSON, Number, Error,
    analysisCache: cache, CACHE_TTL: 60000,
    EventAuthError: class extends Error {},
    libreContext: async () => ({ userId: 'u', patientId: 'p', connections: [], database: {
      from: () => {
        const filters = {};
        const query = {
          select: () => query,
          eq: (field, value) => { filters[field] = value; return query; },
          gte: (_, value) => { filters.start = value; return query; },
          lte: (_, value) => { filters.end = value; return query; },
          gt: (_, value) => { filters.after = value; return query; },
          order: () => query, limit: () => query,
          then: resolve => {
            calls.push(filters);
            return Promise.resolve(resolve(calls.length === failPage ? { error: new Error('query failed') } : {
              data: rows.filter(r => r.user_id === filters.user_id && r.patient_id === filters.patient_id && r.timestamp >= filters.start && r.timestamp <= filters.end && (!filters.after || r.timestamp > filters.after)).slice(0, cap),
            }));
          },
        };
        return query;
      },
    } }),
    calculateStats: history => ({ count: history.length }),
    calculatePercentiles: history => [{ count: history.length }],
  };
  vm.runInNewContext(ts.transpileModule(action, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { run: days => context.exports.getHistoricalGlucoseAction(days, undefined, undefined, undefined, {}), calls, cache };
}
const now = Date.now() - 1000;
const row = (days, user_id = 'u') => ({ user_id, patient_id: 'p', timestamp: new Date(now - days * 86400000).toISOString(), value: 120 });

test('all selected windows include every page and exclude outside/foreign readings', async () => {
  const rows = Array.from({ length: 12960 }, (_, i) => row(i / 144)).concat(row(-1), row(100), row(1, 'other')).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const days of [7, 14, 30, 90]) {
    // A smaller server cap must not be mistaken for the last page.
    const state = setup(rows, { cap: 731 });
    const result = await state.run(days);
    assert.equal(result.success, true);
    assert.equal(result.data.stats.count, days * 144);
    assert.equal(result.data.percentileData[0].count, days * 144);
    assert.ok(state.calls.length > 1);
    assert.equal(result.data.history.length, days * 144 > 5000 ? 0 : days * 144);
  }
});

test('a failed later page never returns or caches a partial analysis', async () => {
  const state = setup(Array.from({ length: 2000 }, (_, i) => row(i / 144)), { failPage: 2 });
  const result = await state.run(30);
  assert.equal(result.success, false);
  assert.equal(state.cache.size, 0);
});

test('empty period produces an empty analysis', async () => {
  const result = await setup([]).run(7);
  assert.equal(result.success, true);
  assert.equal(result.data.stats.count, 0);
});
