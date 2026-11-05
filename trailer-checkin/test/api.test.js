import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, createStore } from '../src/db.js';
import { createHandler } from '../src/app.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
let server, base;

before(async () => {
  const handler = createHandler({ store: createStore(openDb()), publicDir });
  server = createServer(handler);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (path, { method = 'GET', body, headers = {}, raw } = {}) => {
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, res };
};

test('full trailer lifecycle: check in, update, note, delete', async () => {
  const created = await call('/api/trailers', {
    method: 'POST', headers: { 'X-User-Name': 'Maria' },
    body: { trailer_number: 'T-1', carrier: 'ACME', pallet_count: 22, bol_number: 'B1', door: '4' },
  });
  assert.equal(created.status, 201);
  const id = created.json.id;
  assert.equal(created.json.seal_intact, true);
  assert.equal(created.json.notes[0].kind, 'status');
  assert.equal(created.json.notes[0].author, 'Maria');

  const patched = await call(`/api/trailers/${id}`, { method: 'PATCH', body: { status: 'unloading', condition: 'damaged', seal_intact: false } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.status, 'unloading');
  assert.equal(patched.json.seal_intact, false);
  assert.match(patched.json.notes.at(-1).body, /arrived → unloading/);

  const noted = await call(`/api/trailers/${id}/notes`, { method: 'POST', body: { body: '2 pallets crushed', author: 'Sam' } });
  assert.equal(noted.status, 201);
  assert.equal(noted.json.notes.at(-1).body, '2 pallets crushed');
  assert.equal(noted.json.notes.at(-1).author, 'Sam');

  assert.equal((await call(`/api/trailers/${id}`)).json.notes.length, 3);
  assert.equal((await call(`/api/trailers/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await call(`/api/trailers/${id}`)).status, 404);
});

test('list supports status filter and search (including LIKE wildcards literally)', async () => {
  await call('/api/trailers', { method: 'POST', body: { trailer_number: 'ZZ-9', carrier: 'Fast Freight', po_numbers: '100%OFF' } });
  await call('/api/trailers', { method: 'POST', body: { trailer_number: 'ZZ-10', carrier: 'Slow Freight', status: 'unloaded' } });
  const byQ = await call('/api/trailers?q=fast');
  assert.deepEqual(byQ.json.map((t) => t.trailer_number), ['ZZ-9']);
  const byStatus = await call('/api/trailers?status=unloaded');
  assert.ok(byStatus.json.every((t) => t.status === 'unloaded'));
  assert.equal((await call('/api/trailers?q=%25')).json.length, 1); // only the literal "%"
  assert.equal((await call('/api/trailers?status=bogus')).status, 400);
});

test('validation errors return 422 with field details', async () => {
  const r = await call('/api/trailers', { method: 'POST', body: { trailer_number: '' } });
  assert.equal(r.status, 422);
  assert.ok(r.json.details.trailer_number && r.json.details.carrier);
  assert.equal((await call('/api/trailers/1/notes', { method: 'POST', body: {} })).status, 422);
  assert.equal((await call('/api/trailers/1', { method: 'PATCH', body: { status: 'x' } })).status, 422);
});

test('error handling: bad JSON, unknown ids, methods and routes', async () => {
  assert.equal((await call('/api/trailers', { method: 'POST', raw: '{oops' })).status, 400);
  assert.equal((await call('/api/trailers', { method: 'POST', raw: 'x'.repeat(200 * 1024) })).status, 413);
  assert.equal((await call('/api/trailers/99999')).status, 404);
  assert.equal((await call('/api/trailers/abc')).status, 404);
  assert.equal((await call('/api/trailers/99999', { method: 'PATCH', body: { door: '1' } })).status, 404);
  assert.equal((await call('/api/trailers/99999', { method: 'DELETE' })).status, 404);
  assert.equal((await call('/api/trailers/99999/notes', { method: 'POST', body: { body: 'x' } })).status, 404);
  assert.equal((await call('/api/trailers', { method: 'PUT' })).status, 405);
  assert.equal((await call('/api/trailers/1', { method: 'PUT' })).status, 405);
  assert.equal((await call('/api/trailers/1/notes')).status, 405);
  assert.equal((await call('/api/nope')).status, 404);
  assert.equal((await call('/api/trailers/1/other')).status, 404);
  assert.deepEqual((await call('/api/meta')).json.statuses.length, 5);
});

test('serves the UI and blocks path traversal', async () => {
  const index = await call('/');
  assert.equal(index.status, 200);
  assert.match(index.res.headers.get('content-type'), /text\/html/);
  assert.equal((await call('/app.js')).status, 200);
  assert.equal((await call('/missing.html')).status, 404);
  // fetch() normalizes "/../" away, so send the raw request line ourselves.
  const traversal = await new Promise((resolve, reject) => {
    const { port } = server.address();
    const r = request({ host: '127.0.0.1', port, path: '/..%2fpackage.json' }, (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', reject); r.end();
  });
  assert.equal(traversal, 403);
  assert.equal((await call('/%zz')).status, 400);
  assert.equal((await call('/', { method: 'POST' })).status, 405);
  const head = await fetch(base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
});
