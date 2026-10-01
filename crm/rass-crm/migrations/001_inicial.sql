-- Estrutura inicial do CRM, já preparada para várias corretoras (multi-tenant).
-- Toda tabela de dados de clientes tem corretora_id e é protegida por Row Level Security.

CREATE TABLE corretoras (
  id          uuid PRIMARY KEY,
  nome        text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id          uuid PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  nome        text NOT NULL,
  senha_hash  text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membros (
  corretora_id uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel        text NOT NULL DEFAULT 'corretor' CHECK (papel IN ('dono','corretor')),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, usuario_id)
);

CREATE TABLE sessoes (
  id           text PRIMARY KEY,           -- sha256 do token do cookie
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  corretora_id uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  expira_em    timestamptz NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessoes_usuario ON sessoes(usuario_id);

-- ---------- dados de cada corretora ----------

CREATE TABLE clientes (
  corretora_id uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id           text NOT NULL,
  nome         text NOT NULL,
  tel          text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  cpf          text NOT NULL DEFAULT '',
  nasc         date,
  cidade       text NOT NULL DEFAULT '',
  tags         jsonb NOT NULL DEFAULT '[]',
  obs          text NOT NULL DEFAULT '',
  alterado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id)
);

CREATE TABLE negociacoes (
  corretora_id  uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id            text NOT NULL,
  cliente_id    text NOT NULL,
  titulo        text NOT NULL,
  ramo          text NOT NULL DEFAULT '',
  valor         numeric(14,2) NOT NULL DEFAULT 0,
  status        text NOT NULL CHECK (status IN ('Iniciar','Em negociação','Aguardando Cliente','Fechado','Perdido')),
  criado_em     date,
  atualizado_em date,
  alterado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id),
  FOREIGN KEY (corretora_id, cliente_id) REFERENCES clientes(corretora_id, id) ON DELETE CASCADE
);

CREATE TABLE apolices (
  corretora_id  uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id            text NOT NULL,
  cliente_id    text NOT NULL,
  ramo          text NOT NULL DEFAULT '',
  seguradora    text NOT NULL DEFAULT '',
  numero        text NOT NULL DEFAULT '',
  inicio        date,
  fim           date NOT NULL,
  premio        numeric(14,2) NOT NULL DEFAULT 0,
  comissao      numeric(6,2) NOT NULL DEFAULT 0,
  origem        text NOT NULL DEFAULT '',
  renovada_por  text,
  negociacao_id text,
  alterado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id),
  FOREIGN KEY (corretora_id, cliente_id) REFERENCES clientes(corretora_id, id) ON DELETE CASCADE
);
CREATE INDEX apolices_fim ON apolices(corretora_id, fim);
CREATE INDEX apolices_numero ON apolices(corretora_id, numero);

CREATE TABLE interacoes (
  corretora_id uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id           text NOT NULL,
  cliente_id   text NOT NULL,
  data         date NOT NULL,
  hora         text NOT NULL DEFAULT '',
  tipo         text NOT NULL DEFAULT '',
  texto        text NOT NULL DEFAULT '',
  resultado    text NOT NULL DEFAULT '',
  usuario_id   uuid,
  alterado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id),
  FOREIGN KEY (corretora_id, cliente_id) REFERENCES clientes(corretora_id, id) ON DELETE CASCADE
);
CREATE INDEX interacoes_cliente ON interacoes(corretora_id, cliente_id);

CREATE TABLE tarefas (
  corretora_id   uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id             text NOT NULL,
  cliente_id     text NOT NULL,
  data           date NOT NULL,
  hora           text NOT NULL DEFAULT '',
  tipo           text NOT NULL DEFAULT '',
  motivo         text NOT NULL DEFAULT '',
  feita          boolean NOT NULL DEFAULT false,
  interacao_id   text,
  proxima_id     text,
  apolice_id     text,
  negociacao_id  text,
  responsavel_id uuid,
  alterado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id),
  FOREIGN KEY (corretora_id, cliente_id) REFERENCES clientes(corretora_id, id) ON DELETE CASCADE
);
CREATE INDEX tarefas_data ON tarefas(corretora_id, data);

-- aniversários já tratados (o aniversário em si é calculado pela data de nascimento)
CREATE TABLE aniversarios (
  corretora_id uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id           text NOT NULL,               -- b_<cliente>_<data>
  interacao_id text,
  proxima_id   text,
  alterado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id)
);

CREATE TABLE arquivos (
  corretora_id uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id           text NOT NULL,
  cliente_id   text NOT NULL,
  nome         text NOT NULL,
  tamanho_kb   integer NOT NULL DEFAULT 0,
  tipo_mime    text NOT NULL DEFAULT '',
  chave        text NOT NULL,                -- caminho no bucket
  data         date NOT NULL,
  usuario_id   uuid,
  alterado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id),
  FOREIGN KEY (corretora_id, cliente_id) REFERENCES clientes(corretora_id, id) ON DELETE CASCADE
);

CREATE TABLE importacoes (
  corretora_id uuid NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  id           text NOT NULL,
  arquivo      text NOT NULL DEFAULT '',
  usuario_id   uuid,
  resumo       jsonb NOT NULL DEFAULT '{}',
  criado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, id)
);

-- ---------- isolamento entre corretoras (Row Level Security) ----------
-- As rotas de dados rodam com o papel crm_app, que só enxerga as linhas
-- da corretora definida em app.corretora_id para aquela transação.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app NOLOGIN;
  END IF;
  BEGIN
    EXECUTE format('GRANT crm_app TO %I', current_user);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Não foi possível conceder crm_app ao usuário atual: %', SQLERRM;
  END;
END $$;

GRANT USAGE ON SCHEMA public TO crm_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','negociacoes','apolices','interacoes','tarefas','aniversarios','arquivos','importacoes'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO crm_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY por_corretora ON %I
      USING (corretora_id = nullif(current_setting('app.corretora_id', true), '')::uuid)
      WITH CHECK (corretora_id = nullif(current_setting('app.corretora_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
