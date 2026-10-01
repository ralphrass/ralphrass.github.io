// Correspondência entre os objetos usados na tela e as tabelas do banco.
// [campo na tela, coluna no banco, tipo, obrigatório?]
export const COLLECTIONS = {
  clients: { table: 'clientes', fields: [
    ['nome', 'nome', 'text', true], ['tel', 'tel', 'text'], ['email', 'email', 'text'], ['cpf', 'cpf', 'text'],
    ['nasc', 'nasc', 'date'], ['cidade', 'cidade', 'text'], ['tags', 'tags', 'tags'], ['obs', 'obs', 'text'],
  ] },
  deals: { table: 'negociacoes', fields: [
    ['clientId', 'cliente_id', 'text', true], ['titulo', 'titulo', 'text', true], ['ramo', 'ramo', 'text'],
    ['valor', 'valor', 'num'], ['status', 'status', 'status', true], ['criado', 'criado_em', 'date'], ['atualizado', 'atualizado_em', 'date'],
  ] },
  policies: { table: 'apolices', fields: [
    ['clientId', 'cliente_id', 'text', true], ['ramo', 'ramo', 'text'], ['seguradora', 'seguradora', 'text'], ['numero', 'numero', 'text'],
    ['inicio', 'inicio', 'date'], ['fim', 'fim', 'date', true], ['premio', 'premio', 'num'], ['com', 'comissao', 'num'],
    ['src', 'origem', 'text'], ['renovadaPor', 'renovada_por', 'ref'], ['dealId', 'negociacao_id', 'ref'],
  ] },
  interactions: { table: 'interacoes', fields: [
    ['clientId', 'cliente_id', 'text', true], ['date', 'data', 'date', true], ['time', 'hora', 'text'], ['tipo', 'tipo', 'text'],
    ['texto', 'texto', 'text'], ['resultado', 'resultado', 'text'],
  ] },
  tasks: { table: 'tarefas', fields: [
    ['clientId', 'cliente_id', 'text', true], ['date', 'data', 'date', true], ['time', 'hora', 'text'], ['tipo', 'tipo', 'text'],
    ['motivo', 'motivo', 'text'], ['done', 'feita', 'bool'], ['interactionId', 'interacao_id', 'ref'], ['nextTaskId', 'proxima_id', 'ref'],
    ['policyId', 'apolice_id', 'ref'], ['dealId', 'negociacao_id', 'ref'],
  ] },
  bdone: { table: 'aniversarios', fields: [
    ['interactionId', 'interacao_id', 'ref'], ['nextTaskId', 'proxima_id', 'ref'],
  ] },
};
// ordem para gravar (clientes antes do que depende deles); exclusões na ordem inversa
export const UPSERT_ORDER = ['clients', 'deals', 'policies', 'interactions', 'tasks', 'bdone'];

const STATUS = ['Iniciar', 'Em negociação', 'Aguardando Cliente', 'Fechado', 'Perdido'];
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

// Converte um valor vindo da tela para o banco. Lança erro se for inválido.
export function toDb(type, v, required) {
  let out;
  switch (type) {
    case 'text': out = v == null ? '' : String(v).slice(0, 5000); if (required && !out.trim()) throw new Error('vazio'); return out;
    case 'ref': return v ? String(v).slice(0, 80) : null;
    case 'date': if (isDate(v)) return v; if (required) throw new Error('data inválida'); return null;
    case 'num': out = Number(v); return Number.isFinite(out) ? Math.round(out * 100) / 100 : 0;
    case 'bool': return !!v;
    case 'tags': return JSON.stringify(Array.isArray(v) ? v.map(x => String(x).slice(0, 80)).slice(0, 50) : []);
    case 'status': if (STATUS.includes(v)) return v; throw new Error('status inválido');
  }
  throw new Error('tipo desconhecido ' + type);
}

// Converte uma linha do banco para o formato da tela.
export function toUi(type, v) {
  if (v == null) return type === 'num' ? 0 : type === 'bool' ? false : type === 'tags' ? [] : '';
  if (type === 'tags') return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []);
  return v;
}

export const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 80;
