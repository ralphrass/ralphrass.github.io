// Ponto de entrada do servidor.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createDb, migrate, canUseAppRole, tenantRunner } from './db.js';
import { createStorage } from './storage.js';
import { createApp } from './app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.relative(process.cwd(), path.join(ROOT, 'public')) || '.';

if (!process.env.DATABASE_URL && (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME)) {
  console.error('DATABASE_URL não configurada. Em produção o CRM precisa do Postgres; sem ele os dados seriam perdidos a cada deploy.');
  process.exit(1);
}
const db = await createDb();
await migrate(db);
const useRole = await canUseAppRole(db);
const storage = await createStorage();
const prod = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT_NAME;
if (prod && storage.kind !== 's3') console.warn('ATENÇÃO: bucket não configurado. Arquivos anexados ficam no disco do servidor e se perdem a cada deploy.');

const app = createApp({
  db, storage,
  inTenant: tenantRunner(db, useRole),
  secureCookies: prod,
  // cadastro livre só quando liberado, ou enquanto não existe nenhuma corretora
  cadastroAberto: async () => process.env.CADASTRO_ABERTO === '1' || (await db.query('SELECT count(*)::int AS n FROM corretoras'))[0].n === 0,
});

app.get('/entrar', serveStatic({ path: path.join(PUBLIC, 'entrar.html') }));
app.use('/*', serveStatic({ root: PUBLIC }));
app.get('*', serveStatic({ path: path.join(PUBLIC, 'index.html') }));

// limpa sessões vencidas de hora em hora
setInterval(() => db.query('DELETE FROM sessoes WHERE expira_em < now()').catch(() => {}), 3600e3).unref();

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`CRM no ar: http://localhost:${port}  (banco: ${db.kind}, arquivos: ${storage.kind}, isolamento no banco: ${useRole ? 'sim' : 'não'})`);
});
