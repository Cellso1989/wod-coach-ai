# Migracao do banco Render para Supabase

Este projeto ainda usa `render.yaml` apontando para o Postgres gerenciado pelo Render. Para trocar para Supabase sem quebrar o deploy atual, use este fluxo quando o banco Supabase estiver pronto.

## 1. Criar e preparar o banco no Supabase

1. Crie um projeto no Supabase.
2. Em **Project Settings > Database**, copie a connection string do **Transaction Pooler** para o runtime da aplicacao.
3. Copie tambem uma string de conexao direta para as migracoes do Prisma.
4. Troque `[YOUR-PASSWORD]` pela senha do banco e mantenha `schema=public` nos parametros da URL.

Exemplo de formato:

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=3&pool_timeout=20&schema=public"
DIRECT_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?schema=public"
```

## 2. Migrar os dados atuais

Use uma ferramenta de dump/restore PostgreSQL ou o fluxo de migracao assistida do Supabase para copiar os dados do Postgres do Render para o Supabase.

Depois da copia, rode as migracoes do Prisma contra o Supabase:

```bash
pnpm --filter @wod-coach-ai/database run migrate:deploy
```

## 3. Trocar o Render para Supabase

Antes do proximo deploy, configure no painel do Render:

- `DATABASE_URL`: connection string do Supabase Transaction Pooler, porta `6543`, com `pgbouncer=true`, `connection_limit=3`, `pool_timeout=20` e `schema=public`.
- `DIRECT_URL`: connection string direta do Supabase para operacoes do Prisma CLI/migrations. Se a conexao direta IPv6 nao funcionar no Render, use uma conexao nao-transacional apropriada para migrations conforme disponivel no painel do Supabase.
- `JWT_SECRET`: valor fixo e forte, preservado entre deploys.
- `OPENAI_API_KEY`: chave atual.
- `RESEND_API_KEY` e `PASSWORD_RESET_FROM`: se envio de e-mail estiver habilitado.

Quando essas variaveis estiverem preenchidas, substitua o blueprint ativo por `render.supabase.yaml` ou copie o conteudo dele para `render.yaml`.

O arquivo `render.supabase.yaml` remove o banco gerenciado pelo Render do blueprint e transforma `DATABASE_URL` e `DIRECT_URL` em secrets manuais (`sync: false`).

## 4. Validacao

Depois do deploy apontando para Supabase:

```bash
curl https://wod-coach-ai.onrender.com/health
```

Tambem valide login, envio de WOD, envio de HYROX e leitura do historico.

## Observacoes

- Nao altere o `render.yaml` principal antes de configurar `DATABASE_URL` e `DIRECT_URL` no Render.
- Mantenha o banco antigo no Render ate validar que todos os dados aparecem no Supabase.
- Use `DATABASE_URL` com o Transaction Pooler para o trafego normal da aplicacao e reserve `DIRECT_URL` para `prisma migrate deploy`.
