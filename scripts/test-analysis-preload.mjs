import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup({ idleSupported = true } = {}) {
  const idle = new Map();
  let id = 0;
  const window = {
    setTimeout: callback => { idle.set(++id, callback); return id; },
    clearTimeout: id => idle.delete(id),
    ...(idleSupported ? {
      requestIdleCallback: callback => { idle.set(++id, callback); return id; },
      cancelIdleCallback: id => idle.delete(id),
    } : {}),
  };
  function load(path, dependencies = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText, { exports, require: name => dependencies[name] ?? {}, window, Date, Promise, Error, setTimeout, clearTimeout });
    return exports;
  }
  const { AnalysisResource } = load('src/lib/analysis-resource.ts');
  const { preloadAnalysis } = load('src/lib/analysis-preload.ts');
  return { AnalysisResource, preloadAnalysis, idle, async runIdle() {
    const [key, callback] = idle.entries().next().value;
    idle.delete(key);
    callback();
    // Flush the promise chain used by the real AnalysisResource and scheduler.
    for (let i = 0; i < 12; i++) await Promise.resolve();
  } };
}

for (const idleSupported of [true, false]) {
  test(`Monitor warms the same cache used on entering Analysis (idle API: ${idleSupported})`, async () => {
    const state = setup({ idleSupported });
    const profile = new state.AnalysisResource();
    const year = new state.AnalysisResource();
    let calls = 0;
    const fetcher = async () => { calls++; return { success: true, data: { count: 1000 }, validForMs: 600000 }; };
    const stop = state.preloadAnalysis([
      () => profile.load('7', fetcher),
      () => year.load('2026', fetcher),
    ]);
    assert.equal(calls, 0, 'initial Monitor render does not start work synchronously');
    await state.runIdle();
    assert.equal(calls, 1, 'year waits for another idle opportunity');
    assert.equal(profile.read('7').data.count, 1000);
    await state.runIdle();
    await profile.load('7', fetcher);
    await year.load('2026', fetcher);
    assert.equal(calls, 2, 'opening Analysis needs no additional fetch/calculation');
    stop();
  });
}

test('leaving Monitor cancels queued preloads', async () => {
  const state = setup();
  let calls = 0;
  const stop = state.preloadAnalysis([async () => { calls++; }]);
  stop();
  assert.equal(state.idle.size, 0);
  assert.equal(calls, 0);
});

test('switching view during the profile request deduplicates it and cancels the queued year', async () => {
  const state = setup();
  const resource = new state.AnalysisResource();
  let finish;
  let calls = 0;
  const fetcher = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const stop = state.preloadAnalysis([() => resource.load('7', fetcher), async () => { calls++; }]);
  const running = state.runIdle();
  await Promise.resolve();
  const foreground = resource.load('7', fetcher);
  stop();
  finish({ success: true, data: 123, validForMs: 600000 });
  await Promise.all([running, foreground]);
  assert.equal(calls, 1);
  assert.equal(resource.read('7').data, 123);
  assert.equal(state.idle.size, 0);
});

test('clearing the session cache prevents an old in-flight preload from repopulating it', async () => {
  const state = setup();
  const resource = new state.AnalysisResource();
  let finish;
  const stop = state.preloadAnalysis([() => resource.load('7', () => new Promise(resolve => { finish = resolve; }))]);
  await state.runIdle();
  stop();
  resource.clear();
  finish({ success: true, data: 'previous patient', validForMs: 600000 });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(resource.read('7'), undefined);
});

test('a speculative request failure does not prevent a later foreground retry', async () => {
  const state = setup();
  const resource = new state.AnalysisResource();
  const stop = state.preloadAnalysis([() => resource.load('7', async () => { throw Error('offline'); })]);
  await state.runIdle();
  assert.equal(resource.read('7').error, 'offline');
  await resource.load('7', async () => ({ success: true, data: 123, validForMs: 600000 }), true);
  assert.equal(resource.read('7').data, 123);
  assert.equal(resource.read('7').error, undefined);
  stop();
});

test('a failed background preload leaves a cache miss so foreground navigation can retry automatically', async () => {
  const state = setup();
  const resource = new state.AnalysisResource();
  let preloads = 0;
  const stop = state.preloadAnalysis([() => resource.preload('7', async () => { preloads++; return { success: false, error: 'temporary failure' }; })]);
  await state.runIdle();
  assert.equal(preloads, 1, 'the real background request must run');
  assert.equal(resource.read('7'), undefined);
  let calls = 0;
  await resource.load('7', async () => { calls++; return { success: true, data: 123, validForMs: 600000 }; });
  assert.equal(calls, 1);
  assert.equal(resource.read('7').data, 123);
  stop();
});
