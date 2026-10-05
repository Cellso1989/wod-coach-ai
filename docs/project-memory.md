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
- Novas versoes CrossFit arquivam tokens reportados pelo provedor por tentativa e o total da geracao, incluindo retry corretivo, em snapshot.generationMetadata. Uso ausente/invalido fica null; dados legados nao sao estimados. Chamadas sem versao promovida nao formam um livro de custos.
- Custo financeiro estimado, detalhamento de cache/raciocinio e contabilizacao de chamadas que falham continuam fora desta implementacao.
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
- 8: preservacao estrutural de rounds numericos explicitos corrigida e testada; commit 905a263. Prompt alinhado e normalizacao/validacao ligada a fonte dentro do retry; rounds ausentes/parciais, fases buy-in/out sem identificacao e numeracao invalida sao rejeitados. Falha persistente retorna 502 sem modificar dados anteriores. Validacao: 166 testes usuais, 18 em PostgreSQL temporario, 6 E2E, typecheck, build e lint dos arquivos alterados passaram. Limite de 20 blocos mantido; reconhecimento lexical nao garante toda a integridade semantica de movimentos/volumes/cargas.
- 9: coerencia entre contexto e estrutura da estrategia corrigida e testada; commit 10028d5. getAthleteContextForWod retorna internamente o WOD/analise usado no contexto; a rota reutiliza esse objeto e versionId, sem segunda leitura. Reanalise/remocao durante a montagem do contexto agora resulta em 409 no guard de persistencia, sem gravar estrategia de outra versao. Duas regressoes reais falharam antes (200 indevido e 500). Validacao: 168 testes usuais, 20 em PostgreSQL temporario, 6 E2E, typecheck, build e lint dos arquivos alterados passaram; erro global preexistente em sw.js permanece.
- Revisao incremental e fila com evidencias: docs/auditoria-wod-pendencias.md. O relatorio original nao foi localizado no repositorio; a auditoria ainda nao esta encerrada.
- Os pontos criticos numerados 1 a 9 foram corrigidos e comitados separadamente. A auditoria integral continua aberta para as demandas complementares registradas em docs/auditoria-wod-pendencias.md.

## Demandas complementares da auditoria

- Sete frentes autorizadas em 2026-10-05, em etapas separadas: C1 timeout/incomplete; C2 metadados de modelo/prompt/tokens; C3 visualizador de versoes; C4 erros/respostas tardias de frontend; C5 chamadas duplicadas; C6 lint sw.js; C7 matriz de formatos e integridade semantica. Detalhes e limites em docs/auditoria-wod-pendencias.md.
- C1 corrigida e testada; commit e6c8408. Onze regressoes falharam antes. createOpenAiMessageSender usa AbortController com 120 segundos por chamada, incluindo leitura do corpo, e limpa o timer. Exige status completed sem error/incomplete_details; resposta nao concluida retorna 502, timeout 504, ambos sem retry automatico nem persistencia. O retry corretivo de JSON/schema invalido permanece, com prazo renovado na segunda chamada. Transporte compartilhado protege tambem HYROX, sem alterar seus prompts/schema/persistencia. Validacao: 190 testes usuais, 28 em PostgreSQL temporario, 6 E2E, typecheck, build e lint dos arquivos alterados passaram. Lint global repetido falhou no erro preexistente self em sw.js; nenhum provedor real/banco da aplicacao foi usado.
- C2 corrigida e testada; commit 3ed766e. Onze regressoes falharam antes. Transporte retorna id/model/usage opcionais; captureAiGeneration nas rotas CrossFit arquiva modelo solicitado/informado, hash SHA-256 do prompt de sistema, responseId, parametros e tokens de cada tentativa. Metadados ficam em snapshot.generationMetadata, na mesma transacao das versoes, sem migracao ou alteracao dos prompts/retornos dos agentes. Soma inclui retry; total desconhecido fica null, nao zero. Versoes legadas permanecem intactas; edicoes manuais tem metadados nulos. Validacao: 208 testes usuais, 32 em PostgreSQL temporario, 6 E2E, typecheck, build e lint dos arquivos alterados passaram; lint global mantem erro preexistente em sw.js. Limites de cobertura do hash/consumo em docs/auditoria-wod-pendencias.md.
- C3 corrigida e testada; commit 65a2a7e. WodVersionHistory consulta GET /versions em dialogo somente de leitura com selecao/paginacao independentes, fonte/imagem, estrutura, estrategia, contexto e metadados arquivados. Nao restaura nem altera versoes ativas. Dois E2E falharam antes pela ausencia do acesso; cobre erro/retry, legado e lista vazia em celular/desktop. Validacao: 208 testes usuais (32 PG opt-in pulados), oito E2E, typecheck, build e lint dos arquivos alterados passaram; capturas 390/1280 inspecionadas. Lint global permanece com o erro preexistente self em sw.js. Sem backend/migracao/chamada paga/push/deploy. Detalhes em docs/auditoria-wod-pendencias.md.
- C4 corrigida e testada; commit 8fe5dbb. WodDetailContent tem ciclo por id, leituras cancelaveis, loading de todas as projecoes e erro/retry distintos de ausencia 404. Mutacoes nao atualizam/navegam telas abandonadas; reanalise nao continua para estrategia apos sair. Geracao manual bloqueia acoes conflitantes; revisoes reiniciam contexto/estrategia locais com chaves distintas. Falha de estrategia automatica aparece sem apagar analise. Cinco regressoes falharam antes; teste adicional de PR exibido detectou colisao de chaves na implementacao intermediaria, corrigida e repetida. Validacao final: 21 E2E (13 novos), 208 testes usuais (32 PG opt-in pulados), typecheck, build e lint dos arquivos alterados passaram; capturas 390/1280 inspecionadas. Lint global mantem erro preexistente self em sw.js. Sem backend/migracao/chamada paga/push/deploy. Cobertura e limites em docs/auditoria-wod-pendencias.md. Nao cancela IA/gravacao ja em curso no servidor.
- C5 corrigida no escopo concorrente e testada, aguardando aprovacao para commit. runWodGeneration usa WodGenerationLease no PostgreSQL por WOD/ambas as rotas, token e expiracao de dez minutos. Concorrentes recebem 409 antes da IA; ownership conferido antes de cada tentativa e na promocao transacional. Liberacao por token precede a resposta; falha de cleanup nao mascara resultado. Seis regressoes falharam antes. Validacao: 224 testes usuais, 36 PostgreSQL real temporario sem drift, 24 E2E, typecheck/build/lint dos arquivos alterados passaram. Lint global mantem erro preexistente self em sw.js. Migration 20261005180000_add_wod_generation_leases criada e testada somente em banco descartavel; precisa ser aplicada no destino antes de usar a nova geracao. Cliente Prisma gerado e API local reiniciada pela DLL no Windows; sem chamada paga/migracao na aplicacao/push/deploy. Nao e replay por chave idempotente nem exactly-once financeiro; limites em docs/auditoria-wod-pendencias.md.
- C5 comitada com aprovacao do usuario: 7f9955c. O registro anterior descreve a validacao antes do commit; a migration continua sem aplicacao no banco da aplicacao.
- C6 corrigida e verificada, aguardando aprovacao para commit. eslint.config.js declara self readonly somente em apps/web/public/sw.js, sem alterar runtime ou desativar regras. Lint global sem cache passou nas 12 tarefas, zero erros; permanece aviso preexistente de Fast Refresh em ui.tsx. Verificacoes pela API do ESLint confirmaram escopo isolado, global desconhecido rejeitado e self nao reatribuivel; node:vm confirmou fetch sem respondWith e dist/sw.js identico ao fonte. Typecheck/build passaram com cache; suites de IA/DB/E2E nao repetidas por ser mudanca exclusiva de lint. Sem migracao/chamada paga/push/deploy.
- C6 comitada com aprovacao do usuario: a277aa3. O registro anterior descreve os resultados antes do commit.
- C7a corrigida e testada, aguardando aprovacao para commit. analyzeWod confere nomes/categorias, somas de reps/metros/calorias, carga uniforme e numeracao de blocos antes de persistir. Reconstrucao automatica exige linha simples com identidade verificavel, sem numeros extras/carga; T2B/HSW reconhecidos. Doze regressoes falharam antes; usa retry corretivo existente, sem reescrever legado. Matriz com oito formatos, blocos mistos/cargas variaveis e texto de 10000 caracteres validada em inicial/reanalise; tres reanalises sucessivas preservam snapshots. Validacao: 266 testes gerais, 38 PostgreSQL temporario sem drift, 24 E2E, typecheck/build/lint global e dos arquivos alterados passaram. Aviso ui.tsx permanece. Sem migration na aplicacao/chamada paga/push/deploy. Detalhes em docs/auditoria-wod-matriz.md.
- C7b permanece pendente: fidelidade semantica fonte/analise e analise/PRs/perfil/estrategia. Coerencia interna nao prova que dados foram extraidos corretamente nem que coaching e fiel ao atleta. Cargas variaveis e instrucoes de estrategia continuam texto livre; requer exemplos e guardas sensiveis a aliases/escalas/substituicoes antes de corrigir em etapa separada. Nao considerar C7 inteira nem a auditoria encerradas.

## Analise de WOD

- Analises CrossFit agora exigem ao menos um movimento identificado na raiz e em cada round declarado. Resposta vazia segue o retry corretivo existente; se continuar invalida, POST /analyze responde 502 sem substituir analise, estrategia, fonte ou historico. Campos legitimamente desconhecidos continuam nullable; a validacao estrutural de rounds numericos explicitos foi acrescentada no ponto 8, mas omissao parcial de movimentos/volumes/cargas nao esta integralmente coberta.
- Analises e estrategias CrossFit mantem historico em wod_analysis_versions e wod_strategy_versions; as tabelas antigas continuam como projecoes ativas. Reanalise, regeneracao e edicao de duracao acrescentam versoes, sem sobrescrever as anteriores. Edicao do texto remove apenas as projecoes ativas; exclusao explicita do WOD remove tambem suas versoes.
- A migracao 20261005120000_add_wod_versions conserva os registros CrossFit existentes como versao 1. Dados anteriores ja sobrescritos nao sao recuperaveis; estrategias legadas ficam sem vinculo comprovado de analise e sem snapshot de input. HYROX permanece no fluxo anterior.
- Novas estrategias sao vinculadas a versao da analise usada e preservam o input enviado a IA (perfil, PRs, historico e estrutura do treino). Se essa analise deixar de ser ativa durante a geracao, a API responde 409 sem promover uma estrategia desatualizada. Alocacao de numeros e gravacoes sao serializadas por WOD, na mesma transacao das projecoes.
- Contexto e estrutura da estrategia CrossFit usam a mesma leitura da analise alvo, inclusive durante reanalise concorrente. GET /context nao expoe o WOD interno retornado pelo servico. Historico, check-ins, PRs e perfil nao formam um snapshot transacional conjunto; o input efetivamente usado permanece arquivado.
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
