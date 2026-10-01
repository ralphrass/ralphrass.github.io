import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, migrate, canUseAppRole, tenantRunner } from '../src/db.js';
import { createStorage } from '../src/storage.js';
import { createApp } from '../src/app.js';

let db, app, dir;

before(async () => {
  db = await createDb({ url: '', dataDir: 'memory://' });
  await migrate(db);
  const useRole = await canUseAppRole(db);
  assert.equal(useRole, true, 'o isolamento no banco deve estar ativo');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-arq-'));
  const storage = await createStorage({ bucket: '', accessKeyId: '', secretAccessKey: '', dir });
  app = createApp({ db, storage, inTenant: tenantRunner(db, useRole), cadastroAberto: async () => true });
});
after(async () => { await db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

// pequeno cliente HTTP que guarda o cookie de sessão
function client() {
  let cookie = '';
  const req = async (method, url, body, extra = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), ...(extra.headers || {}) };
    let payload = body;
    if (body && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await app.request(url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  return { req, json: async (...a) => { const r = await req(...a); return { status: r.status, body: await r.json() }; } };
}

const A = client(), B = client();

test('cadastro e login', async () => {
  let r = await A.json('POST', '/api/cadastro', { corretora: 'Rass Seguros', nome: 'Ana', email: 'ana@rass.com', senha: 'senha-forte-1' });
  assert.equal(r.status, 200);
  r = await A.json('GET', '/api/eu');
  assert.equal(r.body.corretora.nome, 'Rass Seguros');
  assert.equal(r.body.papel, 'dono');

  r = await B.json('POST', '/api/cadastro', { corretora: 'Outra Corretora', nome: 'Beto', email: 'beto@outra.com', senha: 'senha-forte-2' });
  assert.equal(r.status, 200);

  const C = client();
  r = await C.json('POST', '/api/entrar', { email: 'ana@rass.com', senha: 'errada' });
  assert.equal(r.status, 401);
  r = await C.json('POST', '/api/entrar', { email: 'ANA@rass.com', senha: 'senha-forte-1' });
  assert.equal(r.status, 200);
  r = await C.json('GET', '/api/eu');
  assert.equal(r.body.usuario.nome, 'Ana');
  await C.json('POST', '/api/sair');
  r = await C.json('GET', '/api/eu');
  assert.equal(r.status, 401);

  r = await client().json('POST', '/api/cadastro', { corretora: 'X', nome: 'Y', email: 'ana@rass.com', senha: '12345678' });
  assert.equal(r.status, 409, 'e-mail repetido');
});

test('sem sessão não acessa dados', async () => {
  const r = await client().json('GET', '/api/dados');
  assert.equal(r.status, 401);
});

test('grava e lê os dados da tela', async () => {
  const up = {
    clients: [{ id: 'c1', nome: 'Mariana', tel: '(11) 9', nasc: '1987-03-14', tags: ['Auto'], cpf: '', email: '', cidade: '', obs: '' }],
    deals: [{ id: 'd1', clientId: 'c1', titulo: 'Renovação do Auto', ramo: 'Auto', valor: 3480.5, status: 'Em negociação', criado: '2026-09-01', atualizado: '2026-09-20' }],
    policies: [{ id: 'p1', clientId: 'c1', ramo: 'Auto', seguradora: 'Porto Seguro', numero: '0531', inicio: '2025-10-29', fim: '2026-10-29', premio: 3480, com: 15, dealId: 'd1' }],
    interactions: [{ id: 'i1', clientId: 'c1', date: '2026-09-20', time: '10:00', tipo: 'Ligação', texto: 'Oi', resultado: 'Atendeu' }],
    tasks: [{ id: 't1', clientId: 'c1', date: '2026-10-01', time: '10:00', tipo: 'Renovação', motivo: 'Renovar', done: false, policyId: 'p1', dealId: 'd1' }],
    bdone: [{ id: 'b_c1_2026-03-14', interactionId: 'i1' }],
  };
  let r = await A.json('POST', '/api/sync', { upserts: up });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.erros, []);
  assert.equal(r.body.gravados, 6);

  r = await A.json('GET', '/api/dados');
  const d = r.body;
  assert.equal(d.clients[0].nasc, '1987-03-14');
  assert.deepEqual(d.clients[0].tags, ['Auto']);
  assert.equal(d.deals[0].valor, 3480.5);
  assert.equal(d.policies[0].fim, '2026-10-29');
  assert.equal(d.policies[0].renovadaPor, '');
  assert.equal(d.tasks[0].done, false);
  assert.equal(d.bdone['b_c1_2026-03-14'].interactionId, 'i1');

  // alteração e exclusão
  r = await A.json('POST', '/api/sync', { upserts: { tasks: [{ ...up.tasks[0], done: true, interactionId: 'i1' }] }, deletes: { bdone: ['b_c1_2026-03-14'] } });
  assert.equal(r.body.excluidos, 1);
  r = await A.json('GET', '/api/dados');
  assert.equal(r.body.tasks[0].done, true);
  assert.deepEqual(r.body.bdone, {});
});

test('registros inválidos são recusados sem derrubar o resto', async () => {
  const r = await A.json('POST', '/api/sync', { upserts: {
    clients: [{ id: 'c2', nome: '' }, { id: 'c3', nome: 'Válido' }],
    deals: [{ id: 'd9', clientId: 'c3', titulo: 'X', status: 'Inventado' }],
  } });
  assert.equal(r.status, 200);
  assert.equal(r.body.gravados, 1);
  assert.equal(r.body.erros.length, 2);
});

test('uma corretora não enxerga nem altera os dados da outra', async () => {
  // B usa o mesmo id "c1" e não pode afetar o cliente de A
  let r = await B.json('POST', '/api/sync', { upserts: { clients: [{ id: 'c1', nome: 'Cliente do Beto' }] } });
  assert.equal(r.status, 200);
  r = await B.json('GET', '/api/dados');
  assert.deepEqual(r.body.clients.map(c => c.nome), ['Cliente do Beto']);
  assert.equal(r.body.policies.length, 0);
  r = await A.json('GET', '/api/dados');
  assert.ok(r.body.clients.some(c => c.id === 'c1' && c.nome === 'Mariana'));
  // B tenta apagar os registros de A
  r = await B.json('POST', '/api/sync', { deletes: { policies: ['p1'], tasks: ['t1'] } });
  assert.equal(r.body.excluidos, 0);
  r = await A.json('GET', '/api/dados');
  assert.equal(r.body.policies.length, 1);
});

test('arquivos: enviar, abrir, isolar e apagar', async () => {
  const fd = new FormData();
  fd.append('clienteId', 'c1');
  fd.append('arquivo', new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' }), 'Apólice Auto.pdf');
  let r = await A.json('POST', '/api/arquivos', fd);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const f = r.body;
  assert.equal(f.nome, 'Apólice Auto.pdf');

  let res = await A.req('GET', f.url);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '%PDF-1.4 teste');

  res = await B.req('GET', f.url);
  assert.equal(res.status, 404, 'outra corretora não abre o arquivo');
  res = await B.req('DELETE', f.url);
  assert.equal(res.status, 404);

  r = await A.json('GET', '/api/dados');
  assert.equal(r.body.files.length, 1);

  // cliente de outra corretora não recebe arquivo
  const fd2 = new FormData();
  fd2.append('clienteId', 'c3');
  fd2.append('arquivo', new Blob(['x']), 'x.txt');
  r = await B.json('POST', '/api/arquivos', fd2);
  assert.equal(r.status, 404);

  res = await A.req('DELETE', f.url);
  assert.equal(res.status, 200);
  res = await A.req('GET', f.url);
  assert.equal(res.status, 404);
});

test('bloqueia alterações vindas de outro site', async () => {
  const r = await A.req('POST', '/api/sync', { upserts: {} }, { headers: { origin: 'https://site-malicioso.com', host: 'crm.exemplo.com' } });
  assert.equal(r.status, 403);
});
