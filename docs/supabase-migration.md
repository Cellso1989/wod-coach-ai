# Migracao do banco Render para Supabase

Este projeto ainda usa `render.yaml` apontando para o Postgres gerenciado pelo Render. Para trocar para Supabase sem quebrar o deploy atual, use este fluxo quando o banco Supabase estiver pronto.

## 1. Criar e preparar o banco no Supabase

1. Crie um projeto no Supabase.
2. Em **Project Settings > Database**, copie a connection string do **Session Pooler**.
3. Troque `[YOUR-PASSWORD]` pela senha do banco e mantenha `?schema=public` no final da URL.

Exemplo de formato:

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?schema=public"
```

## 2. Migrar os dados atuais

Use uma ferramenta de dump/restore PostgreSQL ou o fluxo de migracao assistida do Supabase para copiar os dados do Postgres do Render para o Supabase.

Depois da copia, rode as migracoes do Prisma contra o Supabase:

```bash
pnpm --filter @wod-coach-ai/database run migrate:deploy
```

## 3. Trocar o Render para Supabase

Antes do proximo deploy, configure no painel do Render:

- `DATABASE_URL`: connection string do Supabase Session Pooler.
- `JWT_SECRET`: valor fixo e forte, preservado entre deploys.
- `OPENAI_API_KEY`: chave atual.
- `RESEND_API_KEY` e `PASSWORD_RESET_FROM`: se envio de e-mail estiver habilitado.

Quando essas variaveis estiverem preenchidas, substitua o blueprint ativo por `render.supabase.yaml` ou copie o conteudo dele para `render.yaml`.

O arquivo `render.supabase.yaml` remove o banco gerenciado pelo Render do blueprint e transforma `DATABASE_URL` em secret manual (`sync: false`).

## 4. Validacao

Depois do deploy apontando para Supabase:

```bash
curl https://wod-coach-ai.onrender.com/health
```

Tambem valide login, envio de WOD, envio de HYROX e leitura do historico.

## Observacoes

- Nao altere o `render.yaml` principal antes de configurar `DATABASE_URL` no Render.
- Mantenha o banco antigo no Render ate validar que todos os dados aparecem no Supabase.
- Se o app crescer ou mudar para ambiente serverless, avalie separar uma URL direta para migracoes e uma URL pooler para runtime.
