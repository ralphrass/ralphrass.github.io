// Conexão com o banco.
// Produção: Postgres (DATABASE_URL). Desenvolvimento e testes: PGlite, um Postgres
// completo que roda dentro do Node, sem instalar nada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function createDb({ url = process.env.DATABASE_URL, dataDir } = {}) {
  let api;
  if (url) {
    const pg = (await import('pg')).default;
    pg.types.setTypeParser(1082, v => v);              // date -> 'YYYY-MM-DD'
    pg.types.setTypeParser(1700, v => parseFloat(v));  // numeric -> number
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL || 10),
      ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
    api = {
      kind: 'postgres',
      query: (t, p) => pool.query(t, p).then(r => r.rows),
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn({ query: (t, p) => c.query(t, p).then(x => x.rows) });
          await c.query('COMMIT');
          return r;
        } catch (e) {
          try { await c.query('ROLLBACK'); } catch {}
          throw e;
        } finally { c.release(); }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = dataDir ?? process.env.PGLITE_DIR ?? path.join(ROOT, 'data', 'pg');
    if (!dir.startsWith('memory://')) fs.mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir, { parsers: { 1082: v => v, 1700: v => parseFloat(v) } });
    await db.waitReady;
    api = {
      kind: 'pglite',
      query: (t, p) => db.query(t, p).then(r => r.rows),
      tx: fn => db.transaction(t => fn({ query: (q, p) => t.query(q, p).then(r => r.rows), exec: sql => t.exec(sql) })),
      close: () => db.close(),
    };
  }
  return api;
}

export async function migrate(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS _migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query('SELECT nome FROM _migracoes')).map(r => r.nome));
  const dir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.tx(async t => {
      if (t.exec) await t.exec(sql); else await t.query(sql);
      await t.query('INSERT INTO _migracoes(nome) VALUES ($1)', [f]);
    });
    console.log(`migração aplicada: ${f}`);
  }
}

// Descobre se dá para trocar para o papel crm_app (que aplica o isolamento por corretora).
export async function canUseAppRole(db) {
  try {
    await db.tx(async t => { await t.query('SET LOCAL ROLE crm_app'); });
    return true;
  } catch (e) {
    console.warn('Aviso: sem permissão para usar o papel crm_app. O isolamento continua pelas consultas, mas sem a trava do banco.', e.message);
    return false;
  }
}

// Executa fn numa transação "dentro" de uma corretora.
export function tenantRunner(db, useRole) {
  return (corretoraId, fn) => db.tx(async t => {
    await t.query(`SELECT set_config('app.corretora_id', $1, true)`, [corretoraId]);
    if (useRole) await t.query('SET LOCAL ROLE crm_app');
    return fn(t);
  });
}
