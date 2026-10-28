import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { performance } from 'node:perf_hooks';
const root = process.argv[2] || '.';
function moduleAt(file, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: module.exports, module, require: name => { if (name in dependencies) return dependencies[name]; throw new Error(name); },
    Date, Intl, setTimeout, console, process,
  });
  return module.exports;
}
function setup() {
  const fixture = moduleAt('scripts/analysis-performance/fixture.ts');
  const metrics = moduleAt(`${root}/src/lib/metrics.ts`);
  const source = fs.readFileSync(`${root}/src/app/actions.ts`, 'utf8')
    .replace('const YEAR_OVERVIEW_PAGE_BATCH_SIZE = 8;', `const YEAR_OVERVIEW_PAGE_BATCH_SIZE = ${process.env.BENCH_YEAR_BATCH || 8};`)
    .replace('const endDate = new Date().toISOString();', 'const endDate = new Date(referenceTime).toISOString();');
  const file = `/tmp/gluco-measure-actions-${process.pid}.ts`;
  fs.writeFileSync(file, 'const referenceTime = '+fixture.referenceTime+';\n'+source.replace('"use server";', ''));
  const result = moduleAt(file, { '@/lib/server/user-auth': fixture, '@/lib/metrics': metrics, '@/lib/librelink': {}, '@/lib/server/analysis-fixture': fixture });
  fs.unlinkSync(file);
  return result;
}
for (const scenario of (process.env.BENCH_YEAR_BATCH ? ['year'] : [7, 14, 30, 90, 'year'])) {
  const cold = [], warm = [];
  for (let repeat = 0; repeat < 5; repeat++) {
    const actions = setup();
    const run = () => scenario === 'year' ? actions.getYearOverviewAction(2026, 'America/Argentina/Buenos_Aires') : actions.getHistoricalGlucoseAction(scenario, undefined, undefined, undefined, { low: 70, high: 180, hypo: 60, hyper: 250 }, 'America/Argentina/Buenos_Aires');
    for (const samples of [cold, warm]) {
      const start = performance.now(); const result = await run();
      if (!result.success) throw new Error(JSON.stringify(result));
      samples.push(Math.round(performance.now() - start));
    }
  }
  console.log(JSON.stringify({ scenario, cold, warm }));
}
