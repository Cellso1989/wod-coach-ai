# Auditoria incremental de analise e reanalise CrossFit

Revisao do codigo em 2026-10-05. Este documento nao substitui nem afirma recuperar
o relatorio original da conversa, cuja copia nao foi encontrada no repositorio.
Usa o pedido original de auditoria, os commits e a memoria do projeto como base.
A auditoria ainda nao esta encerrada. HYROX nao foi alterado nesta etapa.

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

CRITICO, corrigido e testado; aguardando aprovacao para commit. Sete regressoes
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

### 9. Contexto e estrutura podem vir de analises diferentes

CRITICO, janela de concorrencia identificada; precisa de regressao deterministica.
getAthleteContextForWod le a analise alvo e usa seus movimentos para selecionar
PRs e similares. wod-strategy.ts depois rele Wod com analise separadamente.
Se houver reanalise entre as leituras, o contexto pode ser da versao anterior e
a estrutura da atual; o guard de versionId da persistencia verifica apenas a
segunda versao. Se a analise for removida nesse intervalo, analysis! pode falhar.
Proposta: montar contexto e estrutura a partir do mesmo snapshot/versionId,
sem manter uma transacao aberta durante a chamada da IA.

## Pontos importantes e limites da revisao

- O transporte extrai texto, mas nao verifica explicitamente status/incomplete_details
  da resposta do provedor e nao configura prazo com AbortSignal. Parsing invalido
  ja e rejeitado; nao afirmar que todas as respostas incompletas sao identificadas.
- Metadados de modelo, versao do prompt e uso de tokens nao sao arquivados com as versoes.
- A consulta de versoes existe, mas nao ha visualizador de versoes antigas na interface.
- WodDetailPage trata qualquer erro de leitura de analise/estrategia como ausencia;
  respostas tardias de leitura/navegacao precisam de teste de concorrencia de frontend.
- Cliques simultaneos via varias abas/API ainda geram chamadas de IA distintas.
  Serializacao das gravacoes nao significa idempotencia nem controle de custos.
- Lint global tem erro preexistente de self em apps/web/public/sw.js.
- Suites de API mockam transporte de IA; banco real e temporario. E2E atuais
  mockam endpoints. Nao houve teste com provedor real nem migracao na aplicacao.

## Criterio de encerramento

Resolver ou justificar explicitamente cada pendencia critica, uma por etapa.
Completar matriz de formatos (AMRAP, EMOM/E2MOM, For Time, Chipper, strength),
cargas/percentuais, multiplos blocos, entradas longas, truncamento/timeout,
navegacao, refresh, concorrencia e varias reanalises. Registrar precondicao,
passos, resultado esperado e cobertura automatizada de cada caso.
Nao confundir testes passando para cenarios cobertos com auditoria integral encerrada.
