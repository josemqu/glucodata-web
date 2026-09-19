const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.compileFunction(source, ['require', 'module', 'exports'])(name => mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}
for (const file of ['src/lib/librelink.ts', 'supabase/functions/_shared/librelink.ts']) {
  test(`${file}: rejects injected region before sending secrets`, async () => {
    const { LibreLinkUpClient } = load(file);
    const original = global.fetch;
    let calls = 0;
    global.fetch = async () => { calls++; throw Error('unexpected fetch'); };
    try {
      for (const region of ['evil.example/?', 'us@evil.example/', 'us/../../', 'us.libreview.io.evil.test']) {
        await assert.rejects(new LibreLinkUpClient('fake', 'fake-password', region).login(), /Región/);
      }
      assert.equal(calls, 0);
    } finally { global.fetch = original; }
  });
  test(`${file}: blocks HTTP redirects, bounds JSON redirects and redacts upstream errors`, async () => {
    const { LibreLinkUpClient } = load(file);
    const original = global.fetch;
    let calls = 0;
    let data = { status: 0, data: { redirect: true, region: 'us' } };
    global.fetch = async (url, options) => {
      calls++;
      assert.match(url, /^https:\/\/api(?:-[a-z]{2,4})?\.libreview\.io\//);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      return { ok: true, json: async () => data };
    };
    try {
      await assert.rejects(new LibreLinkUpClient('fake', 'fake-password').login(), /redirecciones/);
      assert.equal(calls, 4);
      data = { status: 1, error: { message: 'fake-password provider-secret' } };
      await assert.rejects(new LibreLinkUpClient('fake', 'fake-password').login(), e => !e.message.includes('fake-password') && !e.message.includes('provider-secret'));
      data = { status: 4, data: { step: { type: 'terms' }, authTicket: { token: 'secret' } } };
      const before = calls;
      await assert.rejects(new LibreLinkUpClient('fake', 'fake-password').login(), /condiciones/);
      assert.equal(calls, before + 1);
    } finally { global.fetch = original; }
  });
}
const { NextRequest } = require('next/server');
const { proxy } = load('src/proxy.ts');
test('cookie writes reject cross-origin, null and absent origins', async () => {
  for (const origin of [undefined, 'null', 'https://evil.test', 'https://sibling.example.test']) {
    const request = new NextRequest('https://app.example.test/api/events', { method: 'POST', headers: origin ? { origin } : {} });
    assert.equal(proxy(request).status, 403);
  }
  const same = new NextRequest('https://app.example.test/api/events', { method: 'POST', headers: { origin: 'https://app.example.test' } });
  assert.equal(proxy(same).status, 200);
  assert.match(proxy(same).headers.get('cache-control'), /private, no-store/);
});
test('sensitive URL parameters are stripped, never reflected', () => {
  const response = proxy(new NextRequest('https://app.example.test/?email=fake&password=synthetic-secret'));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://app.example.test/');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
test('native login fallback does not reflect or process submitted secrets', async () => {
  const { POST } = load('src/app/api/auth/login/route.ts');
  const response = await POST(new Request('https://app.example.test/api/auth/login', { method: 'POST', body: 'password=synthetic-secret' }));
  assert.equal(response.status, 400);
  assert.ok(!(await response.text()).includes('synthetic-secret'));
  assert.match(response.headers.get('cache-control'), /no-store/);
  const page = fs.readFileSync('src/app/page.tsx', 'utf8');
  assert.match(page, /<form method="post" action="\/api\/auth\/login"/);
  assert.doesNotMatch(page, /Cookies\.set\("gluco_session"/);
});
test('maintenance blocks reads and writes before authentication during cutover', () => {
  const previous = process.env.GLUCO_MAINTENANCE;
  process.env.GLUCO_MAINTENANCE = 'true';
  try {
    for (const method of ['GET', 'POST']) {
      const response = proxy(new NextRequest('https://app.example.test/api/events', { method }));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('retry-after'), '120');
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  } finally {
    if (previous === undefined) delete process.env.GLUCO_MAINTENANCE;
    else process.env.GLUCO_MAINTENANCE = previous;
  }
});
