# WOD Coach AI

**Seu WOD. Sua estratégia. Seu melhor resultado.**

Aplicação de IA especializada em CrossFit que transforma o WOD recebido pelo atleta em uma estratégia
de execução personalizada, considerando histórico, performance, check-in diário e carga de treino recente.

O objetivo não é programar treinos — é dizer **como executar** o treino que o atleta já recebeu do seu box/coach.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Fastify + TypeScript
- **Banco de dados:** PostgreSQL + Prisma ORM
- **Validação:** Zod
- **IA:** Claude API (Anthropic)
- **Testes:** Vitest (unit/integration), Playwright (e2e)
- **Monorepo:** pnpm workspaces + Turborepo

## Estrutura

```
apps/
  web/            React frontend
  api/            Fastify backend
packages/
  database/       Prisma client wrapper
  types/          Tipos compartilhados
  validation/     Schemas Zod compartilhados
  coach-engine/   Orquestração dos agentes de IA (WodAnalyzer, AthletePerformance, StrategyCoach)
  ai/             Cliente Claude API
prisma/
  schema.prisma   Schema do banco
tests/
  e2e/            Playwright (positive/negative)
  integration/
  unit/
docs/             Documentação do produto e fases
```

## Setup

```bash
cp .env.example .env
docker compose up -d          # sobe PostgreSQL
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm build                     # IMPORTANTE — ver nota abaixo
pnpm dev                       # roda web + api em paralelo
```

- Web: http://localhost:5173
- API: http://localhost:3333/health

> **`pnpm build` antes do primeiro `pnpm dev`:** os pacotes internos (`@wod-coach-ai/types`,
> `validation`, `database`, `coach-engine`, `ai`) apontam `main`/`types` para `dist/`, não para
> `src/` — assim a API roda em produção com `node dist/server.js` puro, sem precisar de
> `tsx`/`ts-node` para resolver pacotes irmãos. Isso significa que **sempre que você editar o
> código-fonte de um desses pacotes**, precisa rodar `pnpm build` de novo antes de `pnpm dev` ou
> `pnpm test` refletirem a mudança — `turbo` já cuida da ordem de build entre pacotes
> automaticamente quando você roda os scripts pela raiz do monorepo.

## Scripts

| Script            | Descrição                              |
| ----------------- | --------------------------------------- |
| `pnpm dev`         | Roda todos os apps em modo dev          |
| `pnpm build`       | Build de todos os apps/packages         |
| `pnpm lint`        | Lint em todo o monorepo                 |
| `pnpm typecheck`   | Checagem de tipos em todo o monorepo    |
| `pnpm test`        | Testes unitários/integração (Vitest)    |
| `pnpm test:e2e`    | Testes end-to-end (Playwright)          |
| `pnpm test:e2e:ui` | Playwright em modo interativo (UI mode) |
| `pnpm db:generate` | Gera o Prisma Client                    |
| `pnpm db:migrate`  | Roda migrations do Prisma               |

## Testes end-to-end (Playwright)

Os testes em `tests/e2e/positive` e `tests/e2e/negative` sobem a aplicação real (web + API)
contra um banco de dados também real — precisam do PostgreSQL rodando (`docker compose up -d`
+ `pnpm db:migrate`). Chamadas à Claude API (`/analyze`, `/strategy`) são interceptadas via
`page.route` com fixtures determinísticas (`tests/e2e/support/ai-mocks.ts`) para que a suíte
nunca gaste créditos reais nem dependa da não-determinística da IA.

```bash
pnpm exec playwright install chromium   # primeira vez apenas
pnpm test:e2e
```

## Fases de desenvolvimento

O projeto é construído em fases incrementais — veja [docs/phases.md](docs/phases.md).
