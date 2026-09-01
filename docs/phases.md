# Fases de desenvolvimento

Cada fase só começa depois que a anterior está implementada e validada (typecheck, lint, testes).

- [x] **Fase 1** — Setup: monorepo, frontend, backend, PostgreSQL, Prisma, Docker, TypeScript, ESLint, Prettier
- [x] **Fase 2** — Authentication + Athlete Profile
- [x] **Fase 3** — Daily Check-in + Readiness Score
- [x] **Fase 4** — Envio de WOD, texto e imagem
- [x] **Fase 5** — WodAnalyzerAgent
- [x] **Fase 6** — Histórico de treinos + resultados
- [x] **Fase 7** — AthletePerformanceAgent
- [x] **Fase 8** — StrategyCoachAgent
- [x] **Fase 9** — Learning Loop
- [x] **Fase 10** — Dashboard + UX (home consolidada: readiness, treino do dia, últimos resultados, PRs)
- [x] **Fase 11** — Playwright (14 testes e2e — positivos e negativos — sobre app + banco reais; IA mockada via `page.route`)
- [x] **Fase 12** — Hardening (error handler centralizado, Helmet, rate limiting por rota, mensagens de erro sem vazar detalhes internos)

## Infraestrutura

WSL2 + Docker Desktop + PostgreSQL estão instalados e rodando. Migration inicial aplicada
(`User`, `AthleteProfile`, `DailyCheckin`, `Wod`, `WodAnalysis`, `WodMovement`, `WodResult`,
`WodFeedback`, `PersonalRecord`, `WodStrategy`). Pipeline completo validado ponta a ponta com
banco real: registro → login → check-in → envio de WOD → análise (IA) → contexto do atleta →
estratégia (IA), tudo persistindo corretamente.

```bash
docker compose up -d      # sobe o PostgreSQL (se não estiver rodando)
pnpm db:migrate           # aplica migrations pendentes
pnpm dev                  # roda web + api
pnpm test:e2e             # testes Playwright (requer web + api + banco rodando)
```

## Hardening (Fase 12) — o que foi feito

- **Error handler centralizado** (`apps/api/src/plugins/error-handler.ts`): erros do Zod viram
  400 limpo, erros conhecidos do Prisma (`P2002`, `P2025`) viram 409/404, qualquer outra coisa
  vira 500 opaco — nunca vaza stack trace, query ou detalhe interno ao cliente. Todo erro
  continua sendo logado por completo no servidor.
- **`@fastify/helmet`**: cabeçalhos de segurança padrão (CSP desativada, já que a API não serve
  HTML — quem serve é o frontend separado).
- **`@fastify/rate-limit`**: limite global generoso (`RATE_LIMIT_MAX`, padrão 300/min/IP) +
  limite bem mais apertado só em `/auth/register` e `/auth/login` (`AUTH_RATE_LIMIT_MAX`,
  padrão 100/min/IP) via `config.rateLimit` por rota — importante: **não** no `/auth/me`, que é
  chamado a cada carregamento de página e acabaria bloqueado à toa se caísse no mesmo limite.
- Handler de rota não encontrada (`setNotFoundHandler`) consistente com o formato de erro do
  resto da API.

## O que ficou de fora (deliberadamente)

Para um MVP validado ponta a ponta, não foram implementados: object storage externo para
imagens de WOD (hoje em base64 no Postgres — ok até a base crescer), normalização de
Injury/Equipment/Goal em tabelas próprias (hoje arrays simples — só valeria a pena com um
catálogo compartilhado entre atletas), fila assíncrona para as chamadas de IA (hoje síncronas
dentro do request — aceitável no volume atual), e observabilidade externa tipo Sentry/Datadog
(hoje só logs estruturados via pino). Nenhum desses bloqueia o uso real do produto hoje.
