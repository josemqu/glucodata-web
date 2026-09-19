const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function load(relative, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.compileFunction(source, ['require', 'module', 'exports'])(name => mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}
const { validateEventInput, isManualGlucose } = load('src/lib/events.ts', { '@/lib/insulins': load('src/lib/insulins.ts') });
const input = () => ({ type: 'health', title: 'Glucómetro de sangre', occurred_at: '2026-01-01T12:34:00-03:00', notes: 'Antes de comer', metadata: { measurement_type: 'capillary_glucose', glucose_mg_dl: 123, unit: 'mg/dL', source: 'blood_glucose_meter' } });
test('capillary value, source, note and timezone survive validation', () => {
  const result = validateEventInput(input());
  assert.equal(result.success, true);
  assert.equal(result.data.occurred_at, '2026-01-01T15:34:00.000Z');
  assert.equal(result.data.metadata.glucose_mg_dl, 123);
  assert.equal(result.data.notes, 'Antes de comer');
  assert.equal(isManualGlucose(result.data), true);
});
test('reject missing, coercible, non-finite, fractional and out-of-bounds readings', () => {
  for (const value of [undefined, null, '', '123', true, [], 0, -1, 1001, 123.5, NaN, Infinity, 'HI', 'LO']) {
    const candidate = input(); candidate.metadata.glucose_mg_dl = value;
    assert.equal(validateEventInput(candidate).success, false, String(value));
  }
});
test('reject future or invalid dates, intervals, wrong unit, source and type', () => {
  for (const patch of [{ occurred_at: new Date(Date.now() + 3600000).toISOString() }, { occurred_at: 'invalid' }, { ended_at: '2026-01-01T16:00:00Z' }, { type: 'note' }]) assert.equal(validateEventInput({ ...input(), ...patch }).success, false);
  for (const patch of [{ unit: 'mmol/L' }, { source: 'sensor' }]) {
    const candidate = input(); Object.assign(candidate.metadata, patch);
    assert.equal(validateEventInput(candidate).success, false);
  }
});
test('existing health notes remain valid and distinct', () => {
  const candidate = { ...input(), metadata: {}, title: 'Dolor de cabeza' };
  assert.equal(validateEventInput(candidate).success, true);
  assert.equal(isManualGlucose(candidate), false);
});
