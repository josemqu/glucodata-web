// Run the public historical/year actions against identical database fixtures.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => dependencies[name] ?? {}, Date, Intl, setTimeout, console, process });
  return exports;
}
process.env.GLUCO_BENCH_GAPS = 'true';
const fixture = load('scripts/analysis-performance/fixture.ts');
function actions(root) {
  const metrics = load(`${root}/src/lib/metrics.ts`);
  let source = fs.readFileSync(`${root}/src/app/actions.ts`, 'utf8').replace('const endDate = new Date().toISOString();', `const endDate = new Date(${fixture.referenceTime}).toISOString();`);
  source = source.replace('"use server";', '');
  const file = `/tmp/gluco-equivalence-${process.pid}.ts`;
  fs.writeFileSync(file, source);
  const result = load(file, { '@/lib/server/user-auth': fixture, '@/lib/server/analysis-fixture': fixture, '@/lib/metrics': metrics });
  fs.unlinkSync(file);
  return result;
}
const before = actions(process.argv[2] || '/tmp/gluco-analysis-before');
const after = actions('.');
for (const zone of ['America/Argentina/Buenos_Aires', 'America/New_York', 'Asia/Kathmandu']) {
  for (const targets of [{ low: 70, high: 180, hypo: 60, hyper: 250 }, { low: 80, high: 160, hypo: 55, hyper: 230 }]) {
    for (const days of [7, 14, 30, 90]) {
      const args = [days, undefined, undefined, undefined, targets, zone];
      const [a, b] = await Promise.all([before.getHistoricalGlucoseAction(...args), after.getHistoricalGlucoseAction(...args)]);
      assert.equal(a.success, true); assert.equal(b.success, true);
      assert.equal(JSON.stringify(b.data), JSON.stringify(a.data), `${zone} ${days}`);
    }
    const args = [2026, zone, targets];
    const [a, b] = await Promise.all([before.getYearOverviewAction(...args), after.getYearOverviewAction(...args)]);
    assert.equal(a.success, true); assert.equal(b.success, true);
    assert.equal(JSON.stringify(b.data), JSON.stringify(a.data), `${zone} year`);
  }
}
console.log('Identical Profile and Year results: 4 windows, 3 zones (including DST, local-midnight gaps and >15-minute gaps), 2 target configurations.');
