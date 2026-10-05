# WOD Coach AI - memoria do projeto

Este arquivo registra aprendizados e decisoes do projeto para manter contexto entre mudancas.
Nao incluir senhas, chaves de API, URLs secretas de banco ou dados sensiveis.

## Regra de memoria

- Toda novidade relevante deve ser registrada neste arquivo no mesmo ciclo da implementacao.
- Documentar decisoes de produto, regras de IA, limites de uso, infraestrutura, deploy, banco de dados, integracoes e comportamentos importantes de UX.
- Nao registrar segredos, credenciais, tokens, URLs completas de banco, dados pessoais sensiveis ou conteudo privado dos usuarios.
- Quando uma mudanca tiver arquivo proprio de apoio, como guia de migracao ou skill, manter aqui um resumo curto e apontar o detalhe no arquivo dedicado.

## Produto

- O app e o WOD Coach AI, focado em CrossFit/WOD.
- URL de producao: https://wod-coach-ai.onrender.com
- O app roda no Render com Web Service Node e banco PostgreSQL.
- A experiencia principal deve ser simples no celular.
- O app tem tema claro/escuro.
- A navegacao principal usa icones e nao deve ficar poluida.
- O painel admin deve ficar escondido, sem aparecer no menu.

## Usuario admin

- A tela admin fica em `/admin`.
- O endpoint admin fica em `/api/admin/users`.
- O acesso admin e validado no backend pelo e-mail logado.
- Admin padrao atual: `celso.sabino1989@gmail.com`.
- Sem login, `/api/admin/users` deve responder 401.
- Com usuario nao admin, deve responder 403.
- O painel admin mostra usuarios, WODs, analises, estrategias, resultados e ultima atividade aproximada.

## IA e custos

- Analise de treino usa `gpt-5-mini`.
- Geracao de estrategia usa `gpt-5-mini`.
- A analise de treino tem `maxTokens: 2500`.
- A estrategia tem `maxTokens: 3500`.
- O app ainda nao grava uso exato de tokens por chamada.
- Um ajuste futuro util e registrar input tokens, output tokens, total tokens e custo estimado por usuario/WOD.
- Evitar chamadas desnecessarias a IA.
- Se houver imagem, a extracao do texto ocorre dentro da chamada de analise do WOD.

## Progresso das correcoes criticas

- 1: invalidacao da estrategia antiga na reanalise corrigida e testada; commit 0b04382.
- 2: rejeicao de orientacao de execucao incompleta corrigida e testada; commit b47454e.
- 3: historico de analises e estrategias corrigido e testado; commit 6d7b90f.
- 4: analise de fonte desatualizada durante edicao corrigida e testada; commit 51611c2. Validacao: 133 testes usuais, 8 em PostgreSQL temporario, 2 E2E, typecheck, build e lint dos arquivos alterados passaram.
- 5: invalidacao entre edicoes concorrentes do WOD corrigida e testada; commit ace37e0. Validacao: 138 testes usuais, 10 em PostgreSQL temporario, 2 E2E, typecheck, build e lint dos arquivos alterados passaram.
- 6: rejeicao de analise sem movimentos na raiz ou em round declarado corrigida e testada; commit 1ee6def. Validacao: 145 testes usuais, 14 em PostgreSQL temporario, 2 E2E, typecheck, build e lint dos arquivos alterados passaram.
- 7: exibicao completa da estrategia corrigida e testada; commit 8b1430f. StrategySection apresenta ritmo, descanso, transicoes, energia, execucao por movimento e avisos, alem dos dados ja exibidos. Validacao: 145 testes usuais, 6 E2E, typecheck, build e lint dos arquivos alterados passaram; capturas de 390 e 1280 px verificadas. Lint global permanece com erro preexistente de self em apps/web/public/sw.js.
- 8: preservacao estrutural de rounds numericos explicitos corrigida e testada; aguardando aprovacao para commit. Prompt alinhado e normalizacao/validacao ligada a fonte dentro do retry; rounds ausentes/parciais, fases buy-in/out sem identificacao e numeracao invalida sao rejeitados. Falha persistente retorna 502 sem modificar dados anteriores. Validacao: 166 testes usuais, 18 em PostgreSQL temporario, 6 E2E, typecheck, build e lint dos arquivos alterados passaram. Limite de 20 blocos mantido; reconhecimento lexical nao garante toda a integridade semantica de movimentos/volumes/cargas.
- Revisao incremental e fila com evidencias: docs/auditoria-wod-pendencias.md. O relatorio original nao foi localizado no repositorio; a auditoria ainda nao esta encerrada.
- NOVOS PROBLEMAS IDENTIFICADOS (pendentes): 9, contexto e estrutura da estrategia usam leituras separadas da analise; requer regressao deterministica antes de correcao. Os pontos 7 e 8 foram tratados em etapas separadas depois do ponto 6.

## Analise de WOD

- Analises CrossFit agora exigem ao menos um movimento identificado na raiz e em cada round declarado. Resposta vazia segue o retry corretivo existente; se continuar invalida, POST /analyze responde 502 sem substituir analise, estrategia, fonte ou historico. Campos legitimamente desconhecidos continuam nullable; a validacao estrutural de rounds numericos explicitos foi acrescentada no ponto 8, mas omissao parcial de movimentos/volumes/cargas nao esta integralmente coberta.
- Analises e estrategias CrossFit mantem historico em wod_analysis_versions e wod_strategy_versions; as tabelas antigas continuam como projecoes ativas. Reanalise, regeneracao e edicao de duracao acrescentam versoes, sem sobrescrever as anteriores. Edicao do texto remove apenas as projecoes ativas; exclusao explicita do WOD remove tambem suas versoes.
- A migracao 20261005120000_add_wod_versions conserva os registros CrossFit existentes como versao 1. Dados anteriores ja sobrescritos nao sao recuperaveis; estrategias legadas ficam sem vinculo comprovado de analise e sem snapshot de input. HYROX permanece no fluxo anterior.
- Novas estrategias sao vinculadas a versao da analise usada e preservam o input enviado a IA (perfil, PRs, historico e estrutura do treino). Se essa analise deixar de ser ativa durante a geracao, a API responde 409 sem promover uma estrategia desatualizada. Alocacao de numeros e gravacoes sao serializadas por WOD, na mesma transacao das projecoes.
- GET /api/wods/:id/versions consulta as versoes do proprio atleta, com 50 resultados por tipo e cursores analysisBefore/strategyBefore. A visualizacao de versoes antigas na interface fica para um passo separado. A migracao deve ser aplicada antes de executar a API atualizada.
- Regressao com PostgreSQL real: gerar o cliente Prisma e executar `powershell -File tests/integration/run-wod-versions.ps1`. O runner cria e remove um container temporario, aplica migracoes com dados legados e verifica rollback, vinculos, paginacao, cascata e concorrencia. A suite real e opt-in; os testes usuais continuam independentes de banco.
- Conflito de fonte durante analise CrossFit corrigido: POST /analyze rele o WOD sob bloqueio antes de gravar. Se texto, imagem ou MIME mudaram (ou o WOD foi removido), responde 409 sem gravar analise, versao, invalidacao de estrategia ou extracao de texto. O atleta deve atualizar e analisar novamente; nao ha retry automatico. Regressao cobre analise inicial, reanalise e imagem com edicao concorrente, inclusive em PostgreSQL temporario.
- Invalidacao entre edicoes concorrentes CrossFit corrigida: PUT /wods/:id rele o texto atual depois de adquirir o bloqueio e decide rawTextChanged dentro da transacao. Texto efetivamente diferente remove somente analise/estrategia ativas; texto igual ou edicao apenas de nome/notas preserva ambas. Historico e resultado permanecem; falha de invalidacao ou gravacao reverte a edicao inteira. A politica de salvamento das edicoes nao mudou. Regressao em banco real usa uma extensao de consulta Prisma para pausar a leitura real anterior ao bloqueio, sem substituir os dados por mocks.
- Ao analisar/reanalisar um WOD CrossFit com sucesso, a nova analise, a remocao da estrategia anterior e o texto extraido da imagem (quando aplicavel) sao persistidos na mesma transacao.
- Se a analise por IA ou a transacao falhar, o conjunto anterior permanece. Se apenas a geracao posterior da estrategia falhar, a nova analise fica salva sem estrategia; uma estrategia antiga nao deve reaparecer ao recarregar.
- A analise nunca deve agrupar movimentos perdendo a estrutura original do treino.
- Se o treino diz "5 rounds", a analise precisa preservar os 5 rounds.
- Exemplo: `5 rounds / 16m lunge / 16 T2B / 8m HSW` nao deve virar apenas `80m / 80 reps / 40m` para a estrategia.
- Totais podem aparecer como resumo, mas a estrategia deve respeitar a ordem e o volume por round/bloco.
- Quando o WOD tem buy-in e buy-out, a estrategia precisa respeitar inicio e fim separadamente.
- Exemplo: `25 thrusters` no comeco e `25 thrusters` no final nao podem virar uma estrategia unica de 50 thrusters.

## Estrategia

- Novas estrategias CrossFit exigem ao menos um item em breakStrategy e movementStrategy, alem de transitionStrategy e energyManagement nao vazios. Respostas incompletas passam pelo retry corretivo existente; se continuarem invalidas, a API responde 502 sem persistir a estrategia.
- Ausencia de quebra planejada deve ser expressa como execucao unbroken ou pausa entre series; treino de um unico movimento ainda deve orientar a passagem entre series/intervalos. Campos opcionais continuam podendo ser null.
- A estrategia deve ser objetiva e facil de ler no celular.
- Evitar texto longo e tecnico demais.
- A estrategia deve considerar:
  - formato do WOD;
  - rounds/blocos originais;
  - sequencia dos movimentos;
  - PRs e historico do atleta quando existirem;
  - estimulo do treino;
  - carga e capacidade conhecida.
- Exemplo de raciocinio desejado: se o treino tem 10 BMU por round e o atleta tem PR de 22 reps, a estrategia pode sugerir atacar mais esse movimento.
- Nao renderizar a secao visual de tecnica/warnings na estrategia por enquanto.

## HYROX

- A aba de esteira foi removida do app.
- HYROX tem area propria em `/hyrox`.
- HYROX segue o mesmo modelo de fluxo do CrossFit: enviar treino por texto/foto, listar historico, ver detalhe, analisar e gerar estrategia.
- Os treinos HYROX usam a mesma tabela base `wods`, separados por `discipline = HYROX`; WODs CrossFit usam `discipline = CROSSFIT`.
- A estrategia HYROX e separada da estrategia de CrossFit/WOD e persiste em `hyrox_strategies`.
- O usuario pode colar um treino estilo HYROX definido pelo box, nao apenas uma prova padrao.
- O `HyroxStrategyCoachAgent` usa IA para responder como executar o treino recebido: pacing, plano por blocos, quebras, transicoes, risco critico e final.
- A prova oficial HYROX continua sendo referencia de dominio: corrida + estacoes, preservar capacidade de correr/trabalhar no bloco seguinte, sled push/pull e wall balls como pontos comuns de quebra.

## Limites de IA

- O app nao aplica mais quota diaria por usuario para chamadas de IA.
- Analisar WOD, gerar estrategia de WOD, analisar HYROX e gerar estrategia de HYROX chamam a IA diretamente quando a OpenAI esta configurada.
- Para treinos nao padronizados, respeitar a ordem original do treino e nao forcar exatamente as 8 estacoes oficiais.

## Frontend

- Priorizar layout mobile.
- Evitar que textos quebrem de forma feia em chips/badges.
- Frases em badges devem ser curtas.
- A aba `+ Novo WOD` nao deve ativar tambem `Meus WODs`.
- O admin fica fora da barra de navegacao.
- O layout deve continuar limpo, escuro por padrao, com suporte ao tema claro.
- No painel inicial, ocultar `Sem check-in`, manter `Check-in ok` quando houver check-in e usar `Meus PR's` como acesso a `/personal-records`.
- O contador do painel inicial usa o texto `Wod's Realizados`.

## Deploy

- Fluxo atual: commit em `main` e `git push` para GitHub.
- O Render publica automaticamente apos o push.
- Apos deploy, validar:
  - `/health` responde `{ "status": "ok", "service": "wod-coach-ai-api" }`;
  - o HTML da rota alterada usa novo asset JS/CSS;
  - endpoints protegidos retornam 401 sem login.

## Integracoes futuras

- Apple Watch nao e acessivel diretamente por PWA/browser.
- Para Apple Watch/Apple Health, seria necessario app iOS ou wrapper com HealthKit.
- Garmin pode ser integrado via Garmin Health API, mas exige programa/aprovacao.
- Caminho mais simples para dados de wearable:
  - importacao manual de FIT/TCX/GPX/export;
  - depois integracao com Strava via OAuth;
  - por ultimo HealthKit/Garmin direto.
- Dados uteis para o coach: sono, HRV, FC repouso, carga recente, atividades, zonas de FC e recuperacao.
