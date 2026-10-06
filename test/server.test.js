'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sorrismed-'));
process.env.LEADS_FILE = path.join(tmp, 'leads.jsonl');
process.env.ADMIN_TOKEN = 'segredo';
const server = require('../server');

let base;
test.before(() => new Promise((resolve) => {
  server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('serve a página inicial com cabeçalhos de segurança', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.ok(res.headers.get('content-security-policy'));
  assert.match(await res.text(), /SorrisMed/);
});

test('bloqueia path traversal e responde 404', async () => {
  const res = await fetch(base + '/..%2fserver.js');
  assert.equal(res.status, 404);
});

test('salva lead válido e exporta CSV com senha', async () => {
  const res = await fetch(base + '/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'João', telefone: '48999998888', interesse: 'Lentes e facetas', periodo: 'Tarde', consentimento: true, tempo: 8000 })
  });
  assert.equal(res.status, 201);

  const denied = await fetch(base + '/api/leads.csv');
  assert.equal(denied.status, 401);

  const csv = await fetch(base + '/api/leads.csv', {
    headers: { Authorization: 'Basic ' + Buffer.from('admin:segredo').toString('base64') }
  });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /João/);
});

test('retorna 422 para lead inválido', async () => {
  const res = await fetch(base + '/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: '', telefone: '1', consentimento: true, tempo: 8000 })
  });
  assert.equal(res.status, 422);
});
