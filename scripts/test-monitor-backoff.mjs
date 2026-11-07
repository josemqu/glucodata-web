import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup(reply) {
  const source = fs.readFileSync('src/app/page.tsx', 'utf8');
  const fetcher = source.slice(source.indexOf('  const fetchData = async ('), source.indexOf('  const loadMonitorDay =', source.indexOf('  const fetchData = async (')));
  const changes = [];
  let requests = 0;
  const context = {
    Date, Math, console, isLoggedIn: true, authEpochRef: { current: 1 },
    credentialsRef: { current: { email: '', password: '' } }, sessionRef: { current: { token: 'internal' } },
    providerRetryAtRef: { current: 0 }, getLatestGlucoseAction: async () => { requests++; return reply; },
    setLoading() {}, setError() {},
    setSession: value => changes.push(['session', value]), setIsLoggedIn: value => changes.push(['loggedIn', value]),
    Cookies: { remove: key => changes.push(['cookie', key]) },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`${fetcher}\nglobalThis.run = fetchData;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, changes, requests: () => requests };
}
test('429 preserves the current session and prevents another request during cooldown', async () => {
  const state = setup({ success: false, error: 'Rate limited', retryAfterSeconds: 120 });
  await state.context.run();
  assert.deepEqual(state.changes, []);
  assert.ok(state.context.providerRetryAtRef.current > Date.now());
  await state.context.run();
  assert.equal(state.requests(), 1);
});
test('an authentication failure still clears the session', async () => {
  const state = setup({ success: false, error: 'Session expired' });
  await state.context.run();
  assert.ok(state.changes.some(([key, value]) => key === 'loggedIn' && value === false));
});
