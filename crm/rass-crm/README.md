# CRM para corretoras de seguros

CRM de vendas orientado à agenda: o dia com os contatos a fazer, negociações por status, ficha do cliente com histórico, apólices e arquivos, e importação de planilhas do Quiver.

Já nasce preparado para várias corretoras (multi-tenant): cada corretora só enxerga os próprios dados, com o isolamento garantido também pelo banco (Row Level Security do Postgres).

## Como rodar no seu computador

Precisa de Node 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Na primeira vez, crie a conta da corretora.

Sem `DATABASE_URL`, o sistema usa um Postgres embutido (PGlite) na pasta `data/pg`, e os arquivos ficam em `data/arquivos`. Não precisa instalar banco nenhum para testar. Para apagar tudo e começar do zero, apague a pasta `data/`.

Testes automáticos (login, gravação, isolamento entre corretoras, arquivos):

```bash
npm test
```

## Publicar no Railway

1. **Código no GitHub.** Suba esta pasta para um repositório privado.
2. **Projeto.** No Railway: *New Project → Deploy from GitHub repo* e escolha o repositório.
3. **Banco.** No projeto: *New → Database → PostgreSQL*. No serviço do CRM, em *Variables*, crie:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
4. **Arquivos.** No projeto: *New → Bucket*. No serviço do CRM, em *Variables*, crie (troque `Bucket` pelo nome que o bucket tiver no seu projeto):
   - `S3_BUCKET` = `${{Bucket.BUCKET}}`
   - `S3_ENDPOINT` = `${{Bucket.ENDPOINT}}`
   - `S3_REGION` = `${{Bucket.REGION}}`
   - `S3_ACCESS_KEY_ID` = `${{Bucket.ACCESS_KEY_ID}}`
   - `S3_SECRET_ACCESS_KEY` = `${{Bucket.SECRET_ACCESS_KEY}}`
   - Se a aba *Credentials* do bucket indicar URLs no estilo *path*, crie também `S3_FORCE_PATH_STYLE` = `1`.
5. **Endereço.** No serviço do CRM: *Settings → Networking → Generate Domain* (ou ligue um domínio próprio).
6. **Backups.** No serviço do Postgres, ative os backups automáticos.
7. **Primeira conta.** Abra o endereço, vá em *Criar conta* e cadastre a corretora. Depois da primeira, o cadastro fecha sozinho. Para abrir para outras corretoras, crie a variável `CADASTRO_ABERTO` = `1`.

O log de início mostra se está tudo certo:

```
CRM no ar: ... (banco: postgres, arquivos: s3, isolamento no banco: sim)
```

## Trazer os dados do protótipo

No protótipo, clique em **Exportar dados para o sistema novo** (no pé da coluna da esquerda) e copie o texto. No sistema novo, clique em **Importar dados do protótipo** e cole. Os clientes de exemplo do protótipo ficam de fora, a menos que você desmarque a opção. Arquivos anexados no protótipo não vão junto.

## Como está organizado

```
src/server.js     inicia o servidor, aplica migrações, serve as telas
src/app.js        rotas da API (login, dados, arquivos)
src/db.js         Postgres (produção) ou PGlite (desenvolvimento); isolamento por corretora
src/schema.js     correspondência entre os dados da tela e as tabelas
src/storage.js    arquivos no bucket S3 ou no disco
src/auth.js       senhas (scrypt) e sessões
migrations/       estrutura do banco, aplicada automaticamente ao iniciar
public/           telas (index.html e entrar.html)
test/             testes automáticos
```

### Como os dados são salvos

A tela carrega os dados da corretora ao abrir e, a cada alteração, envia ao servidor só o que mudou (`POST /api/sync`). O indicador ao lado do botão *Agendar* mostra "Salvando…", "Salvo" ou "Sem conexão". Se a internet cair, o sistema tenta de novo sozinho e avisa antes de fechar a página com alterações pendentes.

Quando dois aparelhos alteram o mesmo registro, vale a última alteração. Ao voltar para a aba, a tela busca o que mudou em outro aparelho.

### Isolamento entre corretoras

- Toda tabela de dados tem `corretora_id`, e toda consulta filtra por ela.
- Além disso, as rotas de dados rodam com o papel `crm_app` do Postgres, que tem Row Level Security forçado: mesmo que uma consulta esqueça o filtro, o banco não devolve nem altera linhas de outra corretora.
- Os arquivos ficam no bucket separados por corretora e só são entregues por links temporários (5 minutos) gerados depois de conferir a sessão.

## Próximos passos

- Convidar outros usuários para a mesma corretora (papel *corretor*).
- Recuperação de senha por e-mail.
- Termos de uso, política de privacidade e contrato de tratamento de dados (LGPD) antes de abrir para outras corretoras.
