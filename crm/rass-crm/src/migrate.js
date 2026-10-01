// Aplica as migrações e sai. Uso: npm run migrate
import { createDb, migrate } from './db.js';

const db = await createDb();
await migrate(db);
await db.close();
console.log('Banco atualizado.');
