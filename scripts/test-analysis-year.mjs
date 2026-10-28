import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => dependencies[name] ?? {}, Date, Intl, setTimeout, console, process });
  return exports;
}
function setup(options = {}) {
  const fixture = load('scripts/analysis-performance/fixture.ts');
  Object.assign(fixture.fixtureOptions, options);
  const root = process.env.ANALYSIS_TEST_ROOT || '.';
  const metrics = load(`${root}/src/lib/metrics.ts`);
  const actions = load(`${root}/src/app/actions.ts`, { '@/lib/server/user-auth': fixture, '@/lib/server/analysis-fixture': fixture, '@/lib/metrics': metrics });
  return () => actions.getYearOverviewAction(2026, 'America/Argentina/Buenos_Aires', { low: 80, high: 160 });
}
test('year includes every reading even when the Data API caps pages below 1000', async () => {
  const result = await setup({ cap: 731 })();
  assert.equal(result.success, true);
  assert.equal(result.data.reduce((sum, day) => sum + day.count, 0), 86509);
  assert.equal(result.data[0].date, '2026-01-01');
  assert.equal(result.data.at(-1).date, '2026-10-28');
});
test('an incomplete later year page is an error, not a cached success', async () => {
  const run = setup({ truncatePage: 2 });
  assert.equal((await run()).success, false);
  assert.equal((await run()).success, true, 'failed result must not populate the cache');
});
test('a failed later year page is an error, and retry recovers', async () => {
  const run = setup({ failPage: 2 });
  assert.equal((await run()).success, false);
  assert.equal((await run()).success, true);
});
