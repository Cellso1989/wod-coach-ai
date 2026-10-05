# Auditoria incremental de analise e reanalise CrossFit

Revisao do codigo em 2026-10-05. Este documento nao substitui nem afirma recuperar
o relatorio original da conversa, cuja copia nao foi encontrada no repositorio.
Usa o pedido original de auditoria, os commits e a memoria do projeto como base.
A auditoria ainda nao esta encerrada. Prompts e persistencia HYROX nao foram
alterados; a protecao do transporte de IA compartilhado tambem se aplica a HYROX.

## Fluxo conferido

1. SubmitWodPage envia texto/imagem pelo cliente apps/web/src/lib/api.ts.
2. POST /api/wods em apps/api/src/routes/wod.ts grava a fonte no Wod.
3. WodDetailPage chama POST /api/wods/:id/analyze tanto inicialmente quanto na reanalise.
4. wod-analysis.ts busca a fonte persistida e chama analyzeWod.
5. wod-analyzer-agent.ts monta o prompt; ai-json-agent.ts faz parsing, validacao e retry.
6. packages/ai/src/index.ts envia a chamada de IA. Nao foi usada IA paga nesta revisao.
7. A rota salva analise, movimentos, versao, extracao e invalidacao da estrategia em transacao.
8. POST /api/wods/:id/strategy monta perfil e contexto em athlete-context-service.ts.
9. strategy-coach-agent.ts gera a estrategia; a rota salva a projecao e seu snapshot de input.
10. WodDetailPage e StrategySection apresentam o estado ativo. GET /versions consulta arquivos anteriores.

Analise inicial e reanalise usam o mesmo endpoint, agente e prompt. Na estrategia,
perfil, PRs e historico sao buscados novamente, nao recuperados apenas do estado da tela.
A estrategia usa a estrutura persistida, nao recebe o texto original como substituto
para movimentos/rounds ausentes. Por isso a completude da analise e essencial.
O contexto exclui o proprio WOD da busca de similares: nao inclui automaticamente
a estrategia anterior desse WOD como exemplo. Isso nao e, por si so, um defeito.

## Resolvidos e comitados

| Ponto | Correcao | Commit |
| --- | --- | --- |
| 1 | Invalidar estrategia antiga ao substituir analise | 0b04382 |
| 2 | Rejeitar orientacao de execucao vazia na estrategia | b47454e |
| 3 | Preservar versoes e contexto enviado a estrategia | 6d7b90f |
| 4 | Rejeitar analise se a fonte mudou durante a IA | 51611c2 |
| 5 | Decidir invalidacao da edicao sob bloqueio | ace37e0 |
| 6 | Rejeitar analises e rounds declarados sem movimentos | 1ee6def |
| 7 | Apresentar todos os campos da estrategia na tela | 8b1430f |
| 8 | Preservar estrutura de rounds numericos explicitos | 905a263 |
| 9 | Usar a mesma versao alvo no contexto e na estrutura | 10028d5 |

## Ponto 6: analise vazia

CRITICO. Reproduzido antes da correcao: schema aceitava movements vazio na raiz
e em rounds declarados; POST /analyze retornava 200, substituindo a analise ativa.
Evidencia: packages/validation/src/wod-analysis.ts, wodAnalysisOutputSchema e
wodRoundOutputSchema; apps/api/src/routes/wod-analysis.ts, POST /analyze.
Correcao desta etapa: minimo de um movimento nessas listas, prompt alinhado,
retry corretivo existente e 502 sem persistencia se a resposta continuar invalida.
Nao corrige ainda omissao parcial de movimentos, volumes ou rounds.

Resultado: corrigido e testado; commit 1ee6def. Seis testes novos
falharam antes da correcao. Depois, pnpm test passou com 145 testes; a suite opt-in
executada por powershell -File tests/integration/run-wod-versions.ps1 passou com
14 testes em PostgreSQL descartavel e esquema sem diferencas. Os 14 aparecem
como skipped no comando usual, pois foram executados separadamente pelo runner.
Playwright wod-reanalysis.spec.ts passou com 2 testes, pnpm typecheck e pnpm build
passaram. ESLint dos arquivos alterados passou; pnpm lint falhou somente no erro
global preexistente descrito abaixo. Nenhuma migracao da aplicacao foi executada.

## NOVOS PROBLEMAS IDENTIFICADOS: fila separada

### 7. Campos da estrategia nao apresentados

CRITICO, corrigido e testado; commit 8b1430f. Antes,
StrategySection.tsx apresentava meta, intensidade, ponto critico, carga, quebras
e confianca, mas nao renderizava pacing, restStrategy, movementStrategy,
transitionStrategy, energyManagement e warnings.
Reproducao: carregar uma estrategia com esses campos preenchidos e comparar
GET /strategy com a tela. O compartilhamento nao substitui a leitura na tela.
Impacto: orientacoes e avisos podem estar salvos e nao chegar ao atleta.
Correcao: secoes compactas e avisos visiveis no componente, sem alterar dados,
API, prompt ou persistencia. Campos opcionais e listas legadas vazias nao geram
secoes vazias. Conteudo nao e truncado; quebra de palavras protege a largura.
Regressao wod-strategy-display.spec.ts falhou antes da mudanca e passou depois
em analise inicial/reanalise, reload e viewports de 390/1280 px. As capturas em
output/playwright foram inspecionadas. Junto com wod-reanalysis.spec.ts, os 6 E2E
passaram. pnpm test passou com 145 testes (14 de banco opt-in nao foram repetidos
nesta etapa de frontend); typecheck, build e lint dos arquivos alterados passaram.
Lint global continua falhando no erro preexistente de self em sw.js.

### 8. Preservacao de rounds explicitos

CRITICO, corrigido e testado; commit 905a263. Sete regressoes
falharam antes da correcao. Exemplo: "5 rounds de 10 T2B + 15 Wall Ball" aceitava
apenas totais agregados. O prompt permitia rounds null em treinos uniformes,
contradizendo a regra prioritaria; o fallback limitado rodava depois da validacao,
fora do retry corretivo. A estrategia recebia a estrutura incompleta.

Correcao em wod-analyzer-agent.ts: prompt alinhado, normalizacao dentro do retry,
nova validacao do schema depois de reconstruir rounds e verificacao estrutural
ligada ao texto original/extraido. Contagens numericas fixas exigem ao menos os
itens declarados, com numeracao sequencial; buy-in/out explicitos exigem blocos
adicionais identificados por label. Multiplos blocos sao somados. Texto original
e extraido sao conferidos separadamente para nao duplicar contagens. Metas de
AMRAP identificadas como meta/goal/target/objetivo nao viram rounds fixos.
O fallback nao reconstrui fases mistas nem inventa volumes/cargas.

Resposta ainda invalida apos o retry retorna 502 sem gravar. Regressao cobre
analise inicial, reanalise, imagem, rounds ausentes/parciais, volumes variaveis,
fases, numeracao, multiplos blocos e normalizacao invalida. A resposta corrigida
salva uma unica versao e seus rounds seguem no snapshot de input da estrategia.
Validacao: 166 testes usuais, 18 em PostgreSQL temporario com esquema sem
diferencas, 6 E2E de analise/reanalise e exibicao da estrategia, typecheck, build
e ESLint dos arquivos alterados passaram. Os 18
testes opt-in sao skipped no comando usual e foram executados separadamente.
Lint global permanece com erro preexistente de self em sw.js. Nenhuma chamada
ao provedor real nem migracao no banco da aplicacao foi executada.

Limites: schema continua limitado a 20 blocos; contagens maiores sao rejeitadas,
nao truncadas. O reconhecimento e lexical/numerico, nao um parser completo:
numeros por extenso, todas as formas de metas e fases sem contagem fixa nao
estao cobertos. Quantidade e labels nao provam correspondencia integral de cada
movimento, volume e carga com a fonte. Essa integridade semantica segue na matriz
de revisao; nao considerar toda omissao parcial resolvida por esta etapa.

### 9. Coerencia entre contexto e estrutura da estrategia

CRITICO, corrigido e testado; commit 10028d5. Duas regressoes
em PostgreSQL falharam antes da correcao. getAthleteContextForWod lia a analise
alvo para selecionar PRs e similares; wod-strategy.ts relia Wod/analise depois.
Uma reanalise entre as leituras promovia estrategia com 200 apesar do contexto
anterior, pois o guard verificava apenas a segunda versao. Uma edicao que
removia a analise causava 500 ao acessar analysis!.versionId.

Correcao: o servico retorna internamente targetWod com a analise/movimentos
ja lidos; a rota usa esse mesmo objeto para estrutura, versionId e snapshot de
fonte, sem reler a analise. O endpoint GET /context continua expondo somente
context. Sem mudanca de prompt/schema da estrategia, migracao ou fluxo HYROX.
Nao ha transacao/bloqueio durante a chamada da IA. O guard existente sob
bloqueio rejeita com 409 se a versao usada deixou de ser ativa, preservando
analise/estrategia/historico mais recentes.

Testes de banco pausam uma consulta real da analise alvo e executam reanalise
ou edicao concorrente por rotas reais. Conferem retorno 409, estrutura original
enviada a IA, contexto com PR real do movimento original e estado sem novas
gravacoes. Testes usuais cobrem tambem geracao apos analise inicial e reanalise,
sem segunda leitura; casos existentes de sucesso conferem o input arquivado.
Validacao: 168 testes usuais, 20 em PostgreSQL temporario, 6 E2E, typecheck,
build e ESLint dos arquivos alterados passaram. Os 20 opt-in sao executados
separadamente. Lint global tem o erro preexistente de self em sw.js. Nao houve
IA paga, migracao no banco da aplicacao, push ou deploy.

Limite: coerencia da versao alvo nao significa snapshot transacional de todos
os dados do atleta. Historico, check-ins, PRs e perfil continuam leituras atuais
separadas; o input efetivamente usado continua arquivado para rastreabilidade.

## Demandas complementares: fila de sete frentes

Autorizadas em 2026-10-05 para execucao incremental, uma por etapa. Esta fila
nao significa sete bugs criticos comprovados: inclui melhorias e validacoes.

| Frente | Demanda | Estado |
| --- | --- | --- |
| C1 | Timeout e respostas nao concluidas da IA | Corrigido e testado; e6c8408 |
| C2 | Arquivar modelo, versao do prompt e tokens | Corrigido e testado; 3ed766e |
| C3 | Visualizador de versoes anteriores | Corrigido e testado; 65a2a7e |
| C4 | Erros de leitura e respostas tardias no frontend | Corrigido e testado; aguarda commit |
| C5 | Evitar chamadas duplicadas de IA | Pendente |
| C6 | Lint preexistente em sw.js | Pendente |
| C7 | Matriz de formatos e integridade de movimentos/volumes/cargas | Pendente |

### C1. Timeout e conclusao da resposta da IA

Corrigido e comitado: e6c8408.

Evidencia: packages/ai/src/index.ts, createOpenAiMessageSender. O transporte
extraia texto de qualquer HTTP 200 sem verificar status/incomplete_details,
e fetch nao tinha prazo. Onze regressoes falharam antes: texto JSON parseavel
com status nao concluido era aceito e nenhum sinal de cancelamento era passado.
Impacto: dados marcados pelo provedor como incompletos poderiam ser salvos;
espera sem prazo deixava a operacao pendente.

Correcao: AbortController com prazo de 120 segundos por chamada, incluindo a
leitura do corpo, e limpeza do timer em finally. Somente status completed sem
error/incomplete_details pode chegar ao parsing dos agentes. Status ausente,
incomplete, failed, cancelled, queued e in_progress retornam 502 com mensagem
explicita; timeout retorna 504. Falhas HTTP continuam no mapeamento anterior.
Nao ha retry automatico dessas falhas. O retry corretivo de JSON/schema invalido
permanece; nesse caso uma operacao pode ter duas chamadas de ate 120 segundos.
Modelo, prompts e limites de tokens nao mudaram. Nenhuma migracao foi criada.

Referencia consultada: [OpenAI Docs - Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
A documentacao orienta verificar status e motivos de incompletude antes de
consumir o resultado. Os testes nao dependem do provedor real.

Cobertura nova: 12 testes de transporte (estados, metadados contraditorios,
cancelamento de fetch/corpo, limpeza de timer, sucesso e erro HTTP); 10 de API
com transporte real e fetch simulado (analise/estrategia inicial e apos reanalise,
sucesso e preservacao de dados em falhas); 8 em PostgreSQL descartavel conferem
integralmente o estado antes/depois de incomplete/timeout, nos dois fluxos.
Timeout e simulado com relogio controlado, sem esperar dois minutos por teste.
Validacao: 190 testes usuais, 28 em PostgreSQL temporario, 6 E2E de analise,
reanalise e exibicao da estrategia, typecheck, build e
ESLint dos arquivos alterados passaram. Lint global foi repetido e falhou
somente no self de sw.js, com aviso preexistente de Fast Refresh em ui.tsx.
Nao houve chamada paga, push, deploy ou migracao no banco da aplicacao.

Limites: o prazo nao e um teto para toda a operacao nem cancela trabalho remoto
garantidamente; abortar a conexao nao garante ausencia de cobranca pelo provedor.
Conclusao do transporte e validacao de schema nao provam integridade semantica
do treino, que permanece na frente C7.

### C2. Metadados da geracao nas versoes CrossFit

Corrigido e comitado: 3ed766e. Evidencias:
packages/ai/src/index.ts retornava apenas texto, descartando id/model/usage;
apps/api/src/services/wod-version-service.ts arquivava fonte/input/resultado,
mas nao os metadados da geracao. Impacto: impossibilidade de rastrear o modelo,
identificar mudancas no prompt ou consultar tokens das tentativas arquivadas.
Onze regressoes falharam antes: sete de transporte e quatro de API, cobrindo
analise/estrategia inicial e apos reanalise.

Correcao sem migracao e sem mudar o retorno dos agentes: transporte preserva
metadados opcionais, e captureAiGeneration coleta cada resposta concluida nas
rotas CrossFit. recordAnalysisVersion/recordStrategyVersion acrescentam
snapshot.generationMetadata na mesma transacao ja usada pelo historico.
GET /versions disponibiliza esse campo dentro dos snapshots existentes;
projecoes ativas, sourceSnapshot e inputSnapshot mantem seus contratos.

Formato schemaVersion 1: provider, agent, attempts e totalUsage. Cada tentativa
registra modelo solicitado, modelo informado pelo provedor, responseId,
promptVersion, requestedReasoningEffort, maxOutputTokens e usage com
inputTokens/outputTokens/totalTokens. promptVersion e SHA-256 do prompt de
sistema efetivamente enviado; muda automaticamente quando esse texto muda,
independentemente dos dados do atleta. Nao arquiva prompt privado ou credenciais.
Modelo do provedor ausente nao e substituido pelo modelo solicitado.

O retry corretivo integra a mesma geracao: tokens da resposta JSON invalida
e da resposta valida sao mantidos separadamente e somados. totalUsage e null
se qualquer tentativa nao informar contagem completa/valida ou se a soma
exceder inteiro seguro. Dados ausentes/malformados ficam null, nunca zero
estimado; zero explicitamente informado e preservado. maxOutputTokens nao e
usado como consumo. Versoes legadas nao sao reescritas; edicao manual de
duracao tem generationMetadata null, sem copiar consumo da versao de IA.

Testes novos: oito de transporte, seis do coletor, quatro de API e quatro em
PostgreSQL, com respostas simuladas do provedor. Banco real verifica percurso
transporte -> agentes -> versoes -> GET /versions, retries, uso parcial,
imutabilidade das versoes anteriores e edicao manual sem chamada de IA.
Testes existentes de erro/rollback/concorrencia continuam preservando snapshots.
Resultado: 208 testes usuais, 32 em PostgreSQL descartavel com esquema sem
diferencas, 6 E2E, typecheck, build e ESLint dos arquivos alterados passaram.
Os 32 opt-in foram executados pelo runner separado; no comando usual sao skipped.
Lint global repetido falhou no self preexistente de sw.js, com aviso de ui.tsx.

Referencia: [OpenAI Docs - Counting tokens](https://developers.openai.com/api/docs/guides/token-counting)
e [Responses API - Get a model response](https://developers.openai.com/api/reference/resources/responses/methods/retrieve).
Os campos sao lidos da resposta, nao estimados pelo tamanho do texto.

Limites: promptVersion identifica o prompt de sistema, nao todo o template do
usuario/correcao ou a versao do parser/schema. SHA-256 identifica o conteudo,
mas nao permite reconstruir um prompt antigo sem o codigo correspondente.
So geracoes promovidas ao historico CrossFit sao arquivadas; chamadas que
falham, conflitos 409 ou rollback nao formam um livro de custos. Nao ha
estimativa financeira nem detalhes separados de cache/raciocinio nesta etapa.
HYROX recebe metadados adicionais do transporte, mas sua persistencia nao foi
alterada. Sem chamada paga, migracao no banco da aplicacao, push ou deploy.

### C3. Consulta das versoes anteriores no frontend

Evidencia: GET /api/wods/:id/versions ja entregava snapshots, mas api.ts nao
oferecia esse metodo e WodDetailPage exibia apenas as projecoes ativas.
Dois cenarios Playwright (390/1280 px) falharam antes pela ausencia do botao
de historico. A lacuna era de acesso na interface, nao de arquivamento.

Implementacao: WodVersionHistory abre um dialogo somente de leitura. Analises
e estrategias tem seletores e paginacao independentes; atualizar/reabrir
consulta novamente o endpoint. Exibe numero, data, motivo da analise e marca
Ativa quando o versionId atual esta disponivel. Fonte textual/imagem, rounds,
movimentos e campos da estrategia sao renderizados a partir do snapshot,
sem combinar com fonte, perfil ou estrategia atuais. Contexto/input arquivado
fica em uma secao expansivel, assim como identificadores, resposta bruta e
metadados tecnicos. Dados legados ausentes ficam explicitos; campos extras
sao preservados sem impor o schema mais restrito das novas geracoes.

Historico nao escreve, regenera ou restaura versoes. Vinculo da estrategia
mostra a versao da analise quando carregada; senao mostra o identificador,
sem inferir vinculos legados. Requisicoes do visualizador sao canceladas ao
fechar/desmontar/substituir a consulta. Nao altera os handlers assincronos
da tela ativa (C4). Nao altera backend, banco, prompts ou persistencia HYROX.

Validacao: 208 testes usuais passaram (32 de PostgreSQL opt-in pulados nesta
etapa, sem mudanca de banco/backend); oito E2E passaram, incluindo os seis
existentes de analise inicial/reanalise e os dois novos de historico.
Os novos cenarios verificam erro e recuperacao, imagem renderizada, rounds,
metadados, selecao/paginacao independente nos dois tipos, vinculo, contexto
legado, lista vazia, fechamento por Escape e ausencia de escritas/alteracao
da tela ativa. Capturas em 390/1280 px inspecionadas sem overflow horizontal.
Typecheck, build e lint dos arquivos alterados passaram. Lint global continua
falhando no erro preexistente self em sw.js (C6), com aviso em ui.tsx.
E2E usa endpoints simulados; sem chamada paga, migracao no banco da aplicacao,
push ou deploy. Corrigido e comitado: 65a2a7e. C4 segue abaixo.

### C4. Estado de leitura e respostas tardias na tela do WOD

Evidencia: WodDetailPage carregava WOD, analise e estrategia em paralelo,
mas encerrava loading apos apenas GET /wods/:id. Os catches das projecoes
ignoravam qualquer falha, nao somente 404. O efeito nao tinha cleanup nem
isolamento por id; handlers de mutacao atualizavam estado/navegavam mesmo
apos trocar de WOD. Raiz: null representava leitura pendente, falha e ausencia.
Cinco regressoes falharam antes; o caso de resposta atrasada foi repetido
com sincronizacao explicita antes da correcao. A captura mostrou WOD B com
a analise atrasada de A. O caso de reanalise tambem mostrou continuacao de
geracao de estrategia de A apos navegar para B.

Correcao restrita ao frontend: WodDetailContent tem ciclo de vida por id.
As tres leituras iniciais usam AbortSignal e Promise.allSettled; loading
termina apenas quando todas possuem resultado. Ausencia de projecao e
confirmada somente por ApiError 404, com falha da fonte impedindo exibir o
WOD. Demais falhas aparecem com nova tentativa de leitura, sem gerar IA.
Dados conhecidos podem ser vistos quando ha erro de projecao, mas as acoes
que dependem do estado ativo ficam bloqueadas. Durante leitura pendente,
o conteudo ativo aguarda as consultas; navegacao continua disponivel.

Handlers de texto, duracao, analise/estrategia automatica e exclusao ignoram
conclusoes apos desmontar; reanalise nao inicia a segunda chamada de IA se
a tela ja foi abandonada. StrategySection informa geracao manual em curso
para bloquear acoes conflitantes na mesma tela; seu callback nao atualiza
uma tela abandonada. Contexto e estrategia locais sao reiniciados quando
muda a revisao da analise, com chaves distintas por secao. Uma regressao
adicional com PR exibido detectou colisao das chaves React na implementacao
intermediaria; usar prefixos context-/strategy- corrigiu o caso, repetido
isoladamente antes da matriz final. Falha na estrategia automatica fica visivel sem
apagar a analise bem-sucedida; gerar manualmente permanece disponivel.

Validacao: nova suite cobre falhas 500/401/rede, erro
404 da fonte, recuperacao sem escritas, leituras pendentes, navegacao com
leitura atrasada, saida durante reanalise e mutacoes de texto/duracao/exclusao,
geracao manual e bloqueio de acoes conflitantes. Suites anteriores de
analise inicial/reanalise, exibicao completa e historico continuam na matriz.
O teste de contexto carrega PR anterior, reanalisa, verifica sua remocao e
consulta o PR atualizado, preservando fonte e resultado.
Resultado final: 21 E2E passaram (13 novos e oito anteriores), 208 testes
usuais passaram (32 PostgreSQL opt-in pulados; sem mudanca de banco/backend).
Typecheck, build e lint dos arquivos alterados passaram. Lint global repetido
permanece com o erro preexistente self em sw.js e o aviso em ui.tsx (C6).
Capturas dos estados de erro em 390/1280 px inspecionadas, com
verificacao de ausencia de overflow horizontal. E2E usa endpoints simulados.
Corrigido e testado, aguardando aprovacao para commit.

Limites: abortar leitura/desconsiderar callback nao cancela gravacao ou IA
ja em curso no servidor. Nao ha idempotencia entre abas/clientes (C5),
polling nem leitura transacional das tres projecoes contra alteracoes em
outra aba. Sem alteracao de backend, prompts, schema, banco ou HYROX;
sem chamada paga, migracao no banco da aplicacao, push ou deploy.
Tres frentes restantes: C5, C6 e C7. C5 e a proxima etapa.

## Pontos importantes e limites da revisao

- O transporte agora exige resposta concluida e tem prazo por chamada (C1).
  Isso nao garante toda a completude semantica dos dados gerados (C7).
- Metadados de modelo, hash do prompt de sistema e tokens agora acompanham novas
  versoes CrossFit (C2); limites de cobertura e custo estao descritos acima.
- A consulta de versoes agora tem visualizador somente de leitura (C3);
  nao ha restauracao nem comparacao automatica entre versoes.
- WodDetailPage distingue falhas de leitura de ausencia e descarta conclusoes
  de telas abandonadas (C4); limites entre abas/servidor estao descritos acima.
- Cliques simultaneos via varias abas/API ainda geram chamadas de IA distintas.
  Serializacao das gravacoes nao significa idempotencia nem controle de custos.
- Lint global tem erro preexistente de self em apps/web/public/sw.js.
- Suites de API usam transporte mockado ou transporte real com fetch simulado;
  banco real e temporario. E2E atuais mockam endpoints. Nao houve teste com
  provedor real nem migracao na aplicacao.

## Criterio de encerramento

Resolver ou justificar explicitamente cada pendencia critica, uma por etapa.
Completar matriz de formatos (AMRAP, EMOM/E2MOM, For Time, Chipper, strength),
cargas/percentuais, multiplos blocos, entradas longas, truncamento/timeout,
navegacao, refresh, concorrencia e varias reanalises. Registrar precondicao,
passos, resultado esperado e cobertura automatizada de cada caso.
Nao confundir testes passando para cenarios cobertos com auditoria integral encerrada.
