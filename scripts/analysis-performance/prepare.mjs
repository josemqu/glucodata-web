import fs from 'node:fs';
import path from 'node:path';
const target = path.resolve(process.argv[2] || '/tmp/gluco-analysis-benchmark');
fs.mkdirSync(target, { recursive: true });
for (const entry of ['src', 'public', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) {
  if (fs.existsSync(entry)) fs.cpSync(entry, path.join(target, entry), { recursive: true });
}
if (!fs.existsSync(path.join(target, 'node_modules'))) fs.symlinkSync(path.resolve('node_modules'), path.join(target, 'node_modules'));
fs.copyFileSync('scripts/analysis-performance/fixture.ts', path.join(target, 'src/lib/server/analysis-fixture.ts'));
let actions = fs.readFileSync(path.join(target, 'src/app/actions.ts'), 'utf8')
  .replace('from "@/lib/server/user-auth"', 'from "@/lib/server/analysis-fixture"');
const latestStart = actions.indexOf('export async function getLatestGlucoseAction(');
const latestEnd = actions.indexOf('export async function getHistoricalGlucoseAction(');
actions = actions.slice(0, latestStart) + 'export async function getLatestGlucoseAction(...args: unknown[]) { return latest(); }\n' + actions.slice(latestEnd);
actions = actions.replace('import { GlucoseData }', 'import { latest, referenceTime, setFailure } from "@/lib/server/analysis-fixture";\nimport { GlucoseData }')
  .replace('const endDate = new Date().toISOString();', 'const endDate = new Date(referenceTime).toISOString();');
actions = actions.replace('const CACHE_TTL = 10 * 60 * 1000;', 'const CACHE_TTL = Number(process.env.GLUCO_BENCH_TTL_MS || 600000);');
fs.writeFileSync(path.join(target, 'src/app/actions.ts'), actions + '\nexport async function benchmarkReset() { analysisCache.clear(); yearOverviewCache.clear(); }\nexport async function benchmarkFailure(value: boolean) { setFailure(value); }\n');
fs.copyFileSync('scripts/analysis-performance/probe.tsx.fixture', path.join(target, 'src/components/benchmark-probe.tsx'));
const layoutFile = path.join(target, 'src/app/layout.tsx');
fs.writeFileSync(layoutFile, fs.readFileSync(layoutFile, 'utf8').replace('import type { Metadata }', 'import { BenchmarkProbe } from \"@/components/benchmark-probe\";\nimport type { Metadata }').replace('{children}\n        </ThemeProvider>', '{children}<BenchmarkProbe />\n        </ThemeProvider>'));
for (const [route, value] of Object.entries({ 'events': { data: [] }, 'patient/insulins': { data: [] }, 'patient/targets': { data: { low: 70, high: 180, hypo: 60, hyper: 250 } } })) {
  const folder = path.join(target, 'src/app/api', route);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'route.ts'), `export async function GET() { return Response.json(${JSON.stringify(value)}); }`);
}
// Only the benchmark clone skips TypeScript checking for its deliberately minimal DB adapter.
fs.writeFileSync(path.join(target, 'next.config.ts'), 'export default { typescript: { ignoreBuildErrors: true }, turbopack: { root: '+JSON.stringify(path.resolve('.'))+' } };');
console.log(target);
