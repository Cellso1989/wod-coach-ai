# Expansao de performance CrossFit

Usuario autorizou implementar todas as frentes em 08/11/2026. Este conjunto
tem verificacao local concluida e commit/push/deploy autorizados em 08/11/2026.
Preservar as alteracoes anteriores de AGENTS.md e a consolidacao da memoria.

## Escopo deste conjunto

1. Gravar analise: detalhar todas as chamadas/transacao; reduzir retorno e
   trafego de imagens sem perder fontes, overrides, CAS, locks ou versoes.
2. Perfil/conexoes: agrupar perfil/check-ins/PRs por conta em uma chamada;
   validar equivalencia, planos e comportamento com pool de tres conexoes.
3. Consistencia: relatorios por configuracao/coorte, amostra explicita,
   correlacao completa, falhas/retries incluidos; coleta real nao e benchmark.
4. Variacao da IA: fixtures fixas, mesmo modelo/prompt/medium/teto e repeticoes;
   avaliar cache de prefixo sem inventar ganho ou equivalencia de coaching.
5. Imagens: Supabase Storage privado, objetos imutaveis, fonte atual e versoes,
   compatibilidade com base64 legado, limpeza apos erro/exclusao e teste HTTP.
6. Fila: PostgreSQL duravel e worker separado; admissao por conta/WOD,
   fencing/CAS antes de cobrar/gravar, sem retry automatico apos falha incerta;
   cliente entende 202/poll e respeita troca de conta; modo sincrono legado.
7. Monitoramento externo: integracao opt-in com dados permitidos e sem PII,
   texto de treino, fotos, prompts, respostas, cookies ou SQL.

## Diagnostico confirmado

Leitura read-only no Supabase em 08/11/2026: projeto hlxtgrjugkgoscndacrb,
regiao sa-east-1, tabelas WOD confirmadas. Render continua em Oregon.
Estatisticas historicas pg_stat_statements: perfil em medias 0,151-0,605 ms;
operacoes de analise/versao com medias 1-12 ms, maximos tipicos abaixo de 45 ms.
Uma consulta historica de versoes teve 499,813 ms. Estes agregados nao isolam
as ultimas geracoes nem medem pool/rede do Render. Indices por conta ja existem.
Ultima amostra da estrategia: 21,459 s cliente, 11,545 s provedor, 2,541 s
contexto, 2,674 s perfil sobreposto e 3,437 s persistencia. Analise 30,336 s,
com 8,101 s de persistencia. Nao anunciar ganho medio/p95 com uma amostra.

## Ativacao externa

Implementar e testar localmente antes de ativar infraestrutura. Novas migrations
somente em PostgreSQL descartavel durante desenvolvimento. Storage precisa de
credencial de servidor no Render; a configuracao local atual nao a possui.
Preferencia de monitoramento perguntada ao usuario de forma assincrona;
Sentry e o padrao proposto caso nao exista servico escolhido. SDK nao exige
plugin de conta. Worker separado sera apresentado com configuracao/custo para
aprovacao final; nenhum recurso pago novo foi provisionado nesta preparacao.

## Implementacao

Runtime limitado a `>=24.15.0 <25`, linha 24 testada localmente (24.15.0),
compativel com os novos SDKs. O log real do ultimo deploy confirmou Node
26.13.0 selecionado pelo antigo `>=20`; a faixa sem teto deixava producao
mudar de major automaticamente. Render deve resolver a versao 24 mais recente
na proxima publicacao; conferir o log de build. Nenhum NODE_VERSION novo foi
configurado remotamente. Esta troca tambem exige coorte de release separada.

Perfil, check-ins dos ultimos 28 dias e PRs consumidos pela estrategia passam
a uma consulta parametrizada, isolada por conta. Datas JSON usam UTC explicito
e voltam a Date, preservando os instantes retornados pelo Prisma. Historico e
alvo continuam sobrepostos. Nao foi alterado o pool ou adicionado indice sem
evidencia. A consulta foi comparada com as projecoes antigas em PostgreSQL real.

Analise agora mede cada chamada de persistencia, incluindo lock, conferencia
da fonte/versao, upsert, arquivo, ativacao, invalidacao e texto extraido. O novo
cliente solicita retorno compacto para evitar reenviar base64 ao receber o
resultado. Clientes anteriores conservam o contrato completo. O detalhamento
deve orientar a proxima coleta real; ainda nao existe resultado de producao
deste conjunto nem promessa de reduzir os 8,101 s da gravacao somente com isso.

Storage e opt-in: `WOD_IMAGE_STORAGE=supabase`, bucket privado `wod-images`,
URL e credencial de servidor. Objeto binario imutavel por conta/WOD/UUID, SHA-256
conferido ao baixar, limite/tipo preservados. Banco e snapshots guardam somente
a referencia para novas fotos. Fotos legadas em base64 continuam legiveis;
nao ha conversao destrutiva ou backfill automatico de versoes. Foto atual e
arquivada passam por endpoints autenticados, `private, no-store`. Credencial
nunca vai ao frontend. Falha de DB so remove upload se uma leitura confirmar
que o WOD nao foi criado; acknowledgement incerto preserva a foto. Exclusao
remove o objeto apos excluir o WOD/versoes. Falhas de limpeza geram codigo fixo.

Manutencao opcional em `apps/api/src/scripts/reconcile-wod-images.ts`: simula
por padrao; `--apply` remove somente objetos sem referencia em WOD ou qualquer
snapshot de analise/estrategia, com mais de 24 h. Lista tudo antes de remover,
reconfere referencias antes de cada lote, limita a 100 mil entradas e nunca
imprime caminhos/contas. Nao foi executada contra o Storage real. Executar com
ambiente de servidor, por exemplo a partir da raiz com Node/tsx:

```powershell
node --env-file=.env --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/src/scripts/reconcile-wod-images.ts
```

Fila opt-in (`WOD_GENERATION_QUEUE_ENABLED=true`) e header do novo cliente.
Rota antiga continua sincrona para clientes antigos. Jobs ficam no PostgreSQL,
com RLS sem politicas de acesso pelo cliente; admissao trava o WOD e captura
fonte/versao. Worker usa `FOR UPDATE SKIP LOCKED`, um job por vez, e revalida
acesso, fonte, versao, lease e token antes de chamar IA e gravar. Dois workers
nao executam o mesmo job; geracao sincrona nao contorna job pendente. Expiracao
de 10 min encerra o job, sem replay automatico apos falha ou crash. GET mostra
expiracao mesmo com worker indisponivel. Resultados privados sao limpos em
lotes apos 24 h. Fechar a pagina nao cancela o job; reabrir o treino permite
ler a analise/estrategia salva. O cliente nao retoma polling antigo depois de
trocar de conta. Nao ha promessa de acelerar o provedor: admissao/polling podem
acrescentar espera; o ganho da fila e durabilidade e isolamento do trabalho.

Worker separado: `node apps/api/dist/generation-worker.js`. SIGTERM interrompe
novos claims e aguarda o atual; configuracao de shutdown 300 s. Nao inicia o
worker de push nem servidor HTTP. A limpeza/claim de expirados usa uma viagem
ao banco, sem tres consultas a cada polling. Blueprint separado em
`render.worker.yaml`, validado contra o JSON Schema atual do Render. Mantem
intacto o Blueprint web antigo (que ainda declara free, diferente do plano
real). Novo worker proposto: Oregon, 0.5 CPU/512 MB, um processo, deploy manual,
aproximadamente US$ 7/mes, alem dos servicos atuais e consumo externo. Fontes
oficiais consultadas em 08/11/2026: [planos](https://render.com/docs/compute-plans),
[precos](https://render.com/pricing), [spec](https://render.com/docs/blueprint-spec).

Sentry e opcional por `SENTRY_DSN`, somente backend/worker. Integracoes e
instrumentacao automaticas desativadas; todas as categorias de coleta de dados
desativadas explicitamente no SDK 11. Logs, traces e metrics externos sao
descartados. Exporta apenas erro HTTP 5xx nas rotas CrossFit cobertas, pedido
acima de 30 s e falha do worker, com codigo, rota parametrizada, status, duracao
e SHA de release. Evento reconstruido por allowlist descarta escopos, cookies,
headers, SQL, fotos, prompts, respostas e identidade. Falha no monitor nao muda
o resultado da requisicao. Teste com transporte real do SDK para coletor HTTP
local confirmou o envelope sem esses conteudos. Nao existe DSN configurado
neste ambiente; painel/alertas do Sentry nao foram ativados remotamente.

## Variacao da IA e coleta

Executado `scripts/benchmark-crossfit-variance.ts` com chave ja configurada,
somente fixtures ficticias (AMRAP, escada e intervalos pontuados), tres repeticoes
por fixture/roteamento, mesmo gpt-5.4-mini-2026-03-17, medium, 8000, prompt e
validadores. Nenhum treino de atleta ou banco da aplicacao foi usado. As 18
geracoes geraram 24 chamadas incluindo correcoes. Evidencia local em
`output/performance/crossfit-variance.json`; resumo reproduzivel com
`scripts/summarize-crossfit-variance.mjs`.

| Roteamento             | Aceitas | Com retry | Mediana, todas | p95 descritivo, todas |
| ---------------------- | ------: | --------: | -------------: | --------------------: |
| Padrao                 |     9/9 |       4/9 |       17,172 s |              22,410 s |
| Chave estavel proposta |     8/9 |       2/9 |       11,397 s |              22,956 s |

Uma rejeicao final no candidato impede recomendar ativacao. A chave estavel
esta disponivel apenas pelo env do servidor `CROSSFIT_PROMPT_CACHE_ROUTING=enabled`,
desativado por padrao e ausente do Blueprint. Nenhuma mudanca de modelo, prompt,
effort ou teto de producao. Amostras pequenas, aquecimento/cache compartilhado
entre ensaios e qualidade de coaching nao avaliada por humano: nao anunciar
ganho causal nem equivalencia. Aceitacao automatica nao e revisao tecnica do
treino. Datas/versoes de prompt preservadas nas tentativas.

Relatorio de producao agora separa coortes por release, execucao sincrona/fila,
fonte, storage, modelo, effort, teto, hash e roteamento. Cada coorte informa
limite de amostra; minimo indicativo 30, sem transformar esse numero em prova
de representatividade. HTTP de enqueue 202 fica separado da execucao do worker
e da espera total; cliente pareado ao job permite medir polling/fila. Falhas e
retries permanecem no denominador. Logs antigos continuam compativeis. Releitura
da coleta anterior confirma uma amostra por operacao/configuracao; proxima
medicao real depende de publicar e usar o app, sem gerar treinos ficticios na
conta de producao para aumentar artificialmente n.

## Ordem de ativacao e rollback

1. Publicar migration e codigo com storage/fila/cache desativados. Migration
   `20261109001017_crossfit_performance_storage_jobs` e aditiva. Conferir health,
   auth e geracao sincrona; coletar leituras agrupadas/persistencia primeiro.
2. Criar bucket privado no projeto Supabase confirmado, limite 8 MiB e MIME
   JPEG/PNG/WebP/GIF; configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
   `WOD_IMAGE_BUCKET` no Render. Ativar storage no web, conferir upload, analise,
   fonte e historico reais. Limite deve acompanhar `WOD_IMAGE_MAX_BYTES`.
3. Configurar `SENTRY_DSN` do projeto escolhido, verificar evento de teste sem
   PII e configurar alerta de 5xx/falha do worker no painel. Sem DSN fica desligado.
4. Provisionar worker aprovado com a MESMA DATABASE_URL, DIRECT_URL, JWT_SECRET,
   OPENAI_API_KEY e configuracao Storage do web. Migration roda primeiro no web;
   worker nao aplica DDL no inicio. Testar um job antes de ativar fila no web.
   Web e worker devem usar o mesmo commit/versao; auto deploy worker esta off.
5. Ativar fila somente com worker saudavel. Coletar coorte separada, comparar
   cliente total, espera da fila, IA, persistencia e falhas. Para desligar:
   parar admissao nova (env false), drenar jobs ativos, depois suspender worker.
   Lease/jobs bloqueiam tentativa concorrente ate finalizar ou expirar.

Voltar storage para database afeta apenas novos uploads; credenciais de leitura
devem continuar disponiveis enquanto existirem referencias externas. Nao fazer
rollback para codigo que desconhece essas referencias depois de ativar Storage.
Nao remover tabelas/colunas ou apagar bucket para desfazer uma flag. Sentry pode
ser desligado removendo DSN. Cache permanece desligado nesta entrega.

## Evidencias e estado

Baseline: develop c09261c, producao d4d97bd, 950 testes gerais e 50 PG.
Verificacao local em 08/11/2026: 968 testes gerais aprovados; 61 testes em
PostgreSQL 16 descartavel, pool 3, incluindo 50 regressoes anteriores e 11 de
fila, fontes, versoes e equivalencia das leituras. Os 20 outros testes PG
opt-in nao foram executados. As 18 migrations foram aplicadas somente no
descartavel, sem drift; container removido. Build, typecheck, ESLint sem avisos,
formatacao dos arquivos alterados, frozen install e diff check aprovados.
Blueprint validado contra schema atual. Playwright CLI com API ficticia local:
analise e estrategia 202/PENDING/RUNNING/SUCCEEDED, estado de espera, historico
de ambas as versoes com foto, telas 390/1280 px, sem overflow horizontal movel
nem erros de console. Transporte real do Sentry enviado somente a coletor local.
SIGTERM do worker em Linux/Render e integracoes externas reais ainda dependem
da ativacao; nao foram simulados como validacao de producao.

Evidencias locais: `output/performance-expansion-tests.txt`,
`output/performance-expansion-postgres.txt`,
`output/performance-expansion-postgres-drift.txt`,
`output/performance-expansion-build.txt`,
`output/performance-expansion-all-typecheck.txt`,
`output/performance-expansion-lint.txt`,
`output/performance-expansion-variance-summary.json`,
`output/performance-expansion-browser-network.txt` e
`output/playwright/performance-history-{mobile,desktop}.png`.

Usuario autorizou commit e deploy em 08/11/2026, incluindo o push necessario
para publicar. Primeira etapa no servico existente: migration aditiva, leituras
agrupadas, resposta compacta e novas medicoes; Storage/Sentry/fila continuam
desativados. Worker pago adicional nao sera provisionado nesta etapa.
Verificacao do deploy pendente. Coletar a proxima coorte real depois de publicar;
a validacao local nao comprova ganho de producao.
