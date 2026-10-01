// Rotas da API.
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { COLLECTIONS, UPSERT_ORDER, toDb, toUi, validId } from './schema.js';
import { hashPassword, checkPassword, newToken, tokenId, SESSION_COOKIE, SESSION_DAYS, tooManyAttempts, recordFailure, clearFailures } from './auth.js';

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 25);
const emailOk = e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
const today = () => new Date().toISOString().slice(0, 10);

export function createApp({ db, storage, inTenant, secureCookies = false, cadastroAberto = () => false }) {
  const app = new Hono();

  // cabeçalhos básicos de segurança
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Frame-Options', 'DENY');
  });

  // proteção contra requisições de outros sites (CSRF): exige mesma origem nas alterações
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin) {
        const host = c.req.header('x-forwarded-host') || c.req.header('host');
        let ok = false;
        try { ok = new URL(origin).host === host; } catch {}
        if (!ok) return c.json({ erro: 'Origem não permitida.' }, 403);
      }
    }
    await next();
  });

  // ---------- sessão ----------
  async function startSession(c, usuarioId, corretoraId) {
    const token = newToken();
    const expira = new Date(Date.now() + SESSION_DAYS * 864e5);
    await db.query('INSERT INTO sessoes(id, usuario_id, corretora_id, expira_em) VALUES ($1,$2,$3,$4)', [tokenId(token), usuarioId, corretoraId, expira.toISOString()]);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: secureCookies, path: '/', maxAge: SESSION_DAYS * 86400 });
  }

  async function auth(c, next) {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return c.json({ erro: 'Entre para continuar.' }, 401);
    const rows = await db.query(
      `SELECT s.usuario_id, s.corretora_id, u.nome, u.email, co.nome AS corretora, m.papel
         FROM sessoes s
         JOIN usuarios u ON u.id = s.usuario_id
         JOIN corretoras co ON co.id = s.corretora_id
         JOIN membros m ON m.usuario_id = s.usuario_id AND m.corretora_id = s.corretora_id
        WHERE s.id = $1 AND s.expira_em > now()`, [tokenId(token)]);
    if (!rows.length) { deleteCookie(c, SESSION_COOKIE, { path: '/' }); return c.json({ erro: 'Sessão expirada. Entre de novo.' }, 401); }
    c.set('s', rows[0]);
    await next();
  }

  app.get('/health', async c => { await db.query('SELECT 1'); return c.text('ok'); });

  app.get('/api/config', async c => c.json({ cadastroAberto: await cadastroAberto() }));

  app.post('/api/cadastro', async c => {
    if (!(await cadastroAberto())) return c.json({ erro: 'O cadastro de novas corretoras está fechado.' }, 403);
    const b = await c.req.json().catch(() => ({}));
    const corretora = String(b.corretora || '').trim(), nome = String(b.nome || '').trim();
    const email = String(b.email || '').trim().toLowerCase(), senha = String(b.senha || '');
    if (!corretora || !nome) return c.json({ erro: 'Preencha o nome da corretora e o seu nome.' }, 400);
    if (!emailOk(email)) return c.json({ erro: 'Confira o e-mail.' }, 400);
    if (senha.length < 8) return c.json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
    const existe = await db.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    if (existe.length) return c.json({ erro: 'Já existe uma conta com esse e-mail. Entre com ela.' }, 409);
    const cid = crypto.randomUUID(), uid = crypto.randomUUID(), hash = await hashPassword(senha);
    await db.tx(async t => {
      await t.query('INSERT INTO corretoras(id, nome) VALUES ($1,$2)', [cid, corretora.slice(0, 200)]);
      await t.query('INSERT INTO usuarios(id, email, nome, senha_hash) VALUES ($1,$2,$3,$4)', [uid, email, nome.slice(0, 200), hash]);
      await t.query(`INSERT INTO membros(corretora_id, usuario_id, papel) VALUES ($1,$2,'dono')`, [cid, uid]);
    });
    await startSession(c, uid, cid);
    return c.json({ ok: true });
  });

  app.post('/api/entrar', async c => {
    const b = await c.req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase(), senha = String(b.senha || '');
    const key = (c.req.header('x-forwarded-for') || '').split(',')[0] + '|' + email;
    if (tooManyAttempts(key)) return c.json({ erro: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
    const [u] = await db.query('SELECT id, senha_hash FROM usuarios WHERE email = $1', [email]);
    if (!u || !(await checkPassword(senha, u.senha_hash))) { recordFailure(key); return c.json({ erro: 'E-mail ou senha incorretos.' }, 401); }
    clearFailures(key);
    const [m] = await db.query('SELECT corretora_id FROM membros WHERE usuario_id = $1 ORDER BY criado_em LIMIT 1', [u.id]);
    if (!m) return c.json({ erro: 'Este usuário não está ligado a nenhuma corretora.' }, 403);
    await startSession(c, u.id, m.corretora_id);
    return c.json({ ok: true });
  });

  app.post('/api/sair', async c => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await db.query('DELETE FROM sessoes WHERE id = $1', [tokenId(token)]);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/eu', auth, c => {
    const s = c.get('s');
    return c.json({ usuario: { id: s.usuario_id, nome: s.nome, email: s.email }, corretora: { id: s.corretora_id, nome: s.corretora }, papel: s.papel });
  });

  // ---------- dados ----------
  app.get('/api/dados', auth, async c => {
    const cid = c.get('s').corretora_id;
    const out = await inTenant(cid, async t => {
      const res = {};
      for (const [key, def] of Object.entries(COLLECTIONS)) {
        const cols = def.fields.map(([, col, type]) => type === 'date' ? `${col}::text AS ${col}` : col);
        const rows = await t.query(`SELECT id, ${cols.join(', ')} FROM ${def.table} WHERE corretora_id = $1`, [cid]);
        res[key] = rows.map(r => {
          const o = { id: r.id };
          for (const [f, col, type] of def.fields) o[f] = toUi(type, r[col]);
          return o;
        });
      }
      const files = await t.query(`SELECT id, cliente_id, nome, tamanho_kb, data::text AS data FROM arquivos WHERE corretora_id = $1 ORDER BY data DESC`, [cid]);
      res.files = files.map(f => ({ id: f.id, clientId: f.cliente_id, nome: f.nome, kb: f.tamanho_kb, date: f.data, url: `/api/arquivos/${encodeURIComponent(f.id)}` }));
      return res;
    });
    // aniversários: a tela usa um objeto { id: {interactionId, nextTaskId} }
    const bdone = {};
    for (const r of out.bdone) bdone[r.id] = { interactionId: r.interactionId || undefined, nextTaskId: r.nextTaskId || undefined };
    out.bdone = bdone;
    return c.json(out);
  });

  // Recebe as alterações feitas na tela: registros novos/alterados e excluídos.
  app.post('/api/sync', auth, bodyLimit({ maxSize: 20 * 1024 * 1024 }), async c => {
    const cid = c.get('s').corretora_id;
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== 'object') return c.json({ erro: 'Dados inválidos.' }, 400);
    const ups = b.upserts || {}, dels = b.deletes || {};
    const erros = [];
    let gravados = 0, excluidos = 0;
    await inTenant(cid, async t => {
      for (const key of UPSERT_ORDER) {
        const list = Array.isArray(ups[key]) ? ups[key] : [];
        if (!list.length) continue;
        const def = COLLECTIONS[key];
        const cols = def.fields.map(f => f[1]);
        const valid = [];
        for (const rec of list) {
          if (!rec || !validId(rec.id)) { erros.push({ colecao: key, id: rec?.id, erro: 'id inválido' }); continue; }
          try { valid.push([rec.id, ...def.fields.map(([f, , type, req]) => toDb(type, rec[f], req))]); }
          catch (e) { erros.push({ colecao: key, id: rec.id, erro: e.message }); }
        }
        // grava em lotes
        for (let i = 0; i < valid.length; i += 200) {
          const chunk = valid.slice(i, i + 200);
          const params = [cid];
          const values = chunk.map(row => {
            const ph = row.map(v => { params.push(v); return `$${params.length}`; });
            return `($1, ${ph.join(', ')})`;
          });
          const set = cols.map(col => `${col} = EXCLUDED.${col}`).concat('alterado_em = now()').join(', ');
          await t.query(`INSERT INTO ${def.table} (corretora_id, id, ${cols.join(', ')}) VALUES ${values.join(', ')}
                         ON CONFLICT (corretora_id, id) DO UPDATE SET ${set}`, params);
          gravados += chunk.length;
        }
      }
      for (const key of [...UPSERT_ORDER].reverse()) {
        const ids = (Array.isArray(dels[key]) ? dels[key] : []).filter(validId);
        if (!ids.length) continue;
        const r = await t.query(`DELETE FROM ${COLLECTIONS[key].table} WHERE corretora_id = $1 AND id = ANY($2) RETURNING id`, [cid, ids]);
        excluidos += r.length;
      }
    });
    return c.json({ ok: true, gravados, excluidos, erros });
  });

  // ---------- arquivos ----------
  app.post('/api/arquivos', auth, bodyLimit({ maxSize: (MAX_FILE_MB + 1) * 1024 * 1024, onError: c => c.json({ erro: `Arquivo maior que ${MAX_FILE_MB} MB.` }, 413) }), async c => {
    const s = c.get('s'), cid = s.corretora_id;
    const body = await c.req.parseBody();
    const file = body.arquivo, clienteId = String(body.clienteId || '');
    if (!file || typeof file === 'string') return c.json({ erro: 'Nenhum arquivo enviado.' }, 400);
    if (file.size > MAX_FILE_MB * 1024 * 1024) return c.json({ erro: `Arquivo maior que ${MAX_FILE_MB} MB.` }, 413);
    const [cli] = await inTenant(cid, t => t.query('SELECT id FROM clientes WHERE corretora_id = $1 AND id = $2', [cid, clienteId]));
    if (!cli) return c.json({ erro: 'Cliente não encontrado. Espere salvar o cliente e tente de novo.' }, 404);
    const id = crypto.randomUUID();
    const nome = String(file.name || 'arquivo').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
    const chave = `${cid}/${clienteId}/${id}-${nome.replace(/[^\w.\-]+/g, '_')}`;
    await storage.put(chave, Buffer.from(await file.arrayBuffer()), file.type);
    const kb = Math.max(1, Math.round(file.size / 1024)), data = today();
    await inTenant(cid, t => t.query(
      `INSERT INTO arquivos(corretora_id, id, cliente_id, nome, tamanho_kb, tipo_mime, chave, data, usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [cid, id, clienteId, nome, kb, file.type || '', chave, data, s.usuario_id]));
    return c.json({ id, clientId: clienteId, nome, kb, date: data, url: `/api/arquivos/${id}` });
  });

  app.get('/api/arquivos/:id', auth, async c => {
    const cid = c.get('s').corretora_id;
    const [f] = await inTenant(cid, t => t.query('SELECT nome, chave, tipo_mime FROM arquivos WHERE corretora_id = $1 AND id = $2', [cid, c.req.param('id')]));
    if (!f) return c.json({ erro: 'Arquivo não encontrado.' }, 404);
    if (storage.signedUrl) return c.redirect(await storage.signedUrl(f.chave, f.nome), 302);
    const buf = await storage.read(f.chave);
    return new Response(buf, { headers: {
      'Content-Type': f.tipo_mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.nome)}`,
    } });
  });

  app.delete('/api/arquivos/:id', auth, async c => {
    const cid = c.get('s').corretora_id;
    const [f] = await inTenant(cid, t => t.query('DELETE FROM arquivos WHERE corretora_id = $1 AND id = $2 RETURNING chave', [cid, c.req.param('id')]));
    if (!f) return c.json({ erro: 'Arquivo não encontrado.' }, 404);
    try { await storage.del(f.chave); } catch (e) { console.error('falha ao apagar do armazenamento', e.message); }
    return c.json({ ok: true });
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ erro: 'Erro inesperado no servidor. Tente de novo.' }, 500);
  });

  return app;
}
