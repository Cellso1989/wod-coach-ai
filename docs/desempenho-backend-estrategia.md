# Desempenho do backend da estrategia CrossFit

Primeira etapa publicada em develop `2936ef8` e main `b28ad73`, em 08/11/2026. Deploy Render
`dep-dbobn6p42hec73d839dg` confirmado live as 15:14:02 de Sao Paulo.

## Evidencia que orientou a mudanca

A geracao real das 14:35:27 de Sao Paulo levou 32,904 s no navegador e 18,489 s
no provedor. Contexto: 4,362 s; perfil: 0,895 s; leitura inicial: 0,895 s;
persistencia: 4,127 s. A diferenca de 14,42 s entre navegador e provedor inclui
autenticacao, rede, reservas, consultas e gravacao; nao corresponde somente ao
banco. Detalhes em [otimizacao-estrategia-crossfit-2026-11-08.md](otimizacao-estrategia-crossfit-2026-11-08.md).

## Alteracoes

- Perfil e contexto sao buscados em paralelo, apos obter a reserva atomica.
  O perfil consulta somente os cinco campos enviados ao agente.
- A reserva ja confere id, conta e disciplina CrossFit no INSERT...SELECT.
  A leitura separada de acesso foi removida do caminho de sucesso. Se a reserva
  inicial falhar, uma leitura com os mesmos filtros distingue 404 de 409.
  Perda de ownership posterior continua sendo conflito, sem essa releitura.
- A leitura do treino/análise continua depois da reserva e alimenta tanto a
  estrutura quanto o contexto da mesma geracao. A fonte completa, inclusive
  imagem, continua disponivel para o snapshot arquivado.
- Leituras paralelas terminam antes da liberacao da reserva mesmo em falha.
  Dentro do contexto, os tres grupos de historico tambem sao aguardados antes
  de propagar um erro. Nenhum resultado de perfil/contexto falho chega a IA.
- A conferencia transacional da analise ativa consulta somente versionId.
  Locks, verificacao de ownership antes de cada tentativa e da promocao,
  upsert, snapshots, numeracao de versoes e timeout foram preservados.
- Tempos separados por operacao de banco permitem investigar a gravacao sem
  retirar suas protecoes. Sao chamadas da aplicacao, nao SQL individual ou
  execucao pura no PostgreSQL. Rotulos fixos, sem SQL/parametros/dados privados.

Nao ha migration, dependencia, mudanca global do Prisma, cache compartilhado,
mudanca de modelo/prompt/validadores ou alteracao do fluxo HYROX. O carregamento
de relacoes por JOIN foi avaliado e adiado: requer recurso preview e muda o
padrao das consultas de relacao, ampliando o escopo sem evidencia do banco real.
Referencia: [otimizacao de consultas Prisma v6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/query-optimization-performance).

## Comparacao controlada local

Mesma rota Fastify e mesmas fixtures antes/depois. Cinco geracoes por revisao,
com banco e IA simulados: leitura inicial 40 ms, contexto 160 ms, perfil 40 ms;
demais operacoes sem atraso artificial. Conferidos retorno 200, dados de
perfil/contexto arquivados e liberacao da reserva em cada geracao.

| Medida                      | Antes      | Depois     |
| --------------------------- | ---------- | ---------- |
| Amostras                    | 5          | 5          |
| Mediana do trabalho da rota | 263,617 ms | 165,878 ms |

Reducao observada no ensaio: 97,739 ms (37,1%). Comprova o efeito das esperas
removidas sob latencia simulada; nao mede SQL real, concorrencia no pool, IA,
cold start ou ganho percentual de producao. Nao extrapolar os 37,1% para o app.
Evidencia local: output/backend-performance-benchmark.json e logs before/after.

## Verificacao

- 944 testes aprovados, incluindo cinco novas regressoes de rota: perfil
  concomitante ao contexto, falha de contexto com perfil pendente, admissao
  recusada com/sem treino visivel e perda posterior da reserva.
- Tres novas regressoes unitarias cobrem telemetria sem conteudo privado,
  resumo de chamadas repetidas/sobrepostas e conclusao das leituras de contexto
  em falha. A reserva tambem confere filtros SQL e tipo distinto de erro inicial.
- Build completo, TypeScript, ESLint dos arquivos alterados e formatacao.
- 70 testes PostgreSQL opt-in pulados: sem banco descartavel configurado,
  Docker indisponivel. Nao foi executado SQL novo no banco da aplicacao nem
  chamada paga ao provedor. A comparacao local usa mocks.

## Proxima coleta

Depois de publicar com aprovacao, exportar janela continua com geracoes reais
e executar scripts/summarize-wod-generation.mjs. Conferir total navegador/HTTP,
modelo/tentativas/fontes e databaseOperations por chamada. Nao somar etapas
sobrepostas. Comparar mais de uma amostra antes de afirmar media/p95 ou ganho
real. Usar os tempos de persistencia e reserva para decidir o proximo ajuste;
tempo de entrada/commit da transacao ainda pode ficar fora das chamadas internas.

## Publicacao

Verificacao as 15:14:10 de Sao Paulo: health/pagina 200, rotas de metricas
e geracao de estrategia 401 sem sessao, JS/CSS com hashes identicos ao build
local de producao. Build remoto concluido e servico confirmado live no commit
validado. Sem nova migration ou geracao autenticada/paga nesta verificacao.
Ganho real sera medido nas proximas geracoes; a verificacao publica nao
exercita as consultas do contexto nem a gravacao com dados de atleta. Evidencia
local: `output/deploy/crossfit-backend-b28ad73-verified.json`.

## Primeira coleta real depois do ajuste

Janela continua de 08/11/2026, 15:17:00-15:19:56 de Sao Paulo: seis eventos,
uma analise e uma estrategia, correlacionadas aos respectivos eventos HTTP e
cliente. Sem paginacao pendente. O teste publico sem sessao das 15:14:07 fica
fora desta janela e nao entra como falha de atleta. Coleta somente de leitura,
sem nova geracao ou chamada paga feita pelo agente.

A estrategia das 15:19:14 terminou 200, aceita na primeira tentativa. Confirmados
gpt-5.4-mini-2026-03-17, medium, teto 8000, mesmo hash do prompt e mesma categoria
de fonte TEXT_AND_IMAGE da amostra anterior das 14:35:27.

| Medida                                       | Antes    | Depois   | Diferenca        |
| -------------------------------------------- | -------- | -------- | ---------------- |
| Navegador                                    | 32,904 s | 36,342 s | +3,438 s         |
| HTTP completo                                | 32,536 s | 36,013 s | +3,477 s         |
| Trabalho da rota                             | 31,462 s | 35,137 s | +3,676 s         |
| Chamada ao provedor                          | 18,489 s | 23,812 s | +5,323 s         |
| Navegador menos provedor                     | 14,415 s | 12,530 s | -1,885 s         |
| Contexto                                     | 4,362 s  | 4,437 s  | +0,075 s         |
| Perfil, sobreposto ao contexto apenas depois | 0,895 s  | 1,051 s  | Nao somar depois |
| Persistencia                                 | 4,127 s  | 4,259 s  | +0,132 s         |

O total nao melhorou nesta geracao. O tempo fora do provedor caiu 1,885 s
(13,1%), enquanto o provedor levou mais 5,323 s. A saida reportada subiu de
5324 para 7372 tokens; o detalhe de raciocinio, ja incluido na saida, de 4722
para 6597. Input 8812/8779 e cache 3968 em ambas. Isso registra variabilidade
do trabalho de IA, sem atribuir causalmente toda a diferenca aos tokens.
Uma amostra por versao e nenhum identificador de treino na telemetria: nao
prova treino identico, ganho medio, p95 ou efeito causal isolado do ajuste.

Novas chamadas detalhadas: alvo 2,093 s, historico 2,342 s, check-ins 1,074 s e
PRs 1,639 s; os tres ultimos se sobrepoem depois do alvo. Perfil 1,051 s ficou
sobreposto ao contexto; sourceRead ausente no sucesso. Reserva/liberacao
0,875/0,876 s e conferencia pre-provedor 0,873 s. Na persistencia, criar versao
1,427 s; demais chamadas individuais 0,351-0,360 s; total transacional 4,259 s.
Sao esperas de chamadas Prisma, que podem executar varios SQLs, e nao tempos
isolados de execucao no banco. Contexto e persistencia seguem como alvos de
investigacao; os tempos nao provam problema de indice, regiao ou pool.

A analise de imagem, cujo fluxo nao foi otimizado nesta entrega, levou 35,520 s
no navegador, 19,863 s no provedor e 8,512 s na persistencia; aceita sem retry.

Evidencias locais: `output/crossfit-production-20261108-post-backend.jsonl`,
`output/crossfit-production-20261108-post-backend-report.json` e
`output/crossfit-production-20261108-post-backend-comparison.json`.

## Segunda etapa: contexto e retorno das versoes

Implementacao local em 08/11/2026, apos o usuario pedir para retomar os ajustes.
Publicado em develop `512b872` e main `d4d97bd`, em 08/11/2026.
Deploy Render `dep-dboggrqvcj2c739cj86g` confirmado live as 20:41:59 de Sao Paulo.

O contexto real de 4,437 s tinha uma dependencia removivel: alvo de 2,093 s
antes do historico de 2,342 s. A rota de estrategia agora inicia o historico
junto com a leitura do alvo, somente depois da reserva atomica que confere
conta e disciplina. Todas as consultas continuam filtradas pela conta; os
limites/janelas/projecoes do historico nao mudam. A mesma leitura do alvo
continua alimentando estrutura e contexto do agente. Nao adiciona consultas.

O modo paralelo e interno e opcional. GET contexto conserva sua verificacao de
existencia/analise antes de consultar o historico. Na estrategia, se o alvo
sumir ou ficar sem analise depois da reserva, as leituras especulativas da
propria conta terminam antes do erro; nenhum dado segue para IA. Todas as
leituras sao aguardadas mesmo em falha, e o erro do alvo tem prioridade sobre
um erro simultaneo do historico. O perfil continua paralelo ao conjunto.

Ao criar versoes de analise e estrategia, o Prisma agora solicita somente o ID
de retorno. O snapshot completo, inclusive fonte/imagem, input da estrategia e
metadados, continua sendo escrito. O retorno completo era descartado pelo
servico; a promocao da versao ativa usa apenas seu ID. Nao altera os retornos
publicos, historicos, numeracao, locks, transacoes ou validadores. A melhoria
da gravacao precisa ser medida em producao; reduzir campos de retorno nao
elimina o custo de enviar/gravar os snapshots completos.

Nao muda modelo/prompt/effort/teto, schema, migrations, configuracao do pool,
autenticacao, cache ou HYROX. O numero de consultas simultaneas cresce de forma
limitada; beneficios sob contencao de pool precisam da proxima coleta real.

Ensaio controlado do servico com esperas sinteticas: alvo 200 ms, historico
240 ms, check-ins 100 ms, PRs 160 ms; cinco amostras por revisao. Mediana de
452,908 ms para 248,971 ms (-203,937 ms/45,0%), com resultados identicos e uma
leitura de alvo/historico por geracao. Mede sobreposicao das esperas em mocks;
nao e percentual de melhoria do aplicativo nem medicao do PostgreSQL/provedor.
Nao mede o efeito da projecao de retorno na persistencia. Evidencia local:
`output/context-overlap-benchmark.json`.

Regressoes novas cobrem inicio do historico com alvo pendente, igualdade do
contexto com historico/PRs/check-in, espera de leituras pendentes e prioridade
do erro do alvo, snapshots completos com retorno restrito e ativacao de seus
IDs. Dois cenarios foram verificados falhando antes dos respectivos ajustes.
O mock transacional respeita a projecao de retorno sem truncar o arquivo salvo.

Na suite PostgreSQL, o teste antigo de isolamento de PR usava um token de
usuario inexistente e recebia 401 antes da rota, em vez de testar o 404 esperado.
A fixture agora cria/remove uma segunda conta aprovada no banco descartavel,
mantendo o 404 e a verificacao de que o PR alheio nao foi alterado. Nenhuma
regra de autenticacao/autorizacao da aplicacao foi alterada.

Verificacao final desta etapa: 950 testes gerais aprovados (70 PG opt-in
pulados nessa execucao), mais 50 testes de versoes em PostgreSQL 16 descartavel
aprovados separadamente. Os outros 20 opt-in de cargas/password-reset nao
foram executados. Foram aplicadas as 17 migrations existentes e a fixture
legada, sem criar migration; Prisma migrate diff sem diferencas. Pool de teste
limitado a tres conexoes. Validacoes de concorrencia, lease expirado, alteracao
de duracao/fonte durante leitura, promocao de versoes e rollback passaram com
banco real. Container descartavel removido ao terminar; banco da aplicacao
preservado. O runner PowerShell antigo tratou a mensagem de inicio do pnpm em
stderr como erro; o runner local Node usa os mesmos SQLs/fixture/testes e
confere o codigo de saida. Build, TypeScript, ESLint, Prettier e diff check
aprovados. Sem chamada paga ou acesso ao banco da aplicacao durante a validacao.

Evidencias locais: `output/context-overlap-tests.txt`,
`output/context-overlap-postgres.txt`, `output/context-overlap-postgres-runner.txt`,
`output/context-overlap-postgres-drift.txt`, `output/context-overlap-build.txt`,
`output/context-overlap-typecheck.txt`, `output/context-overlap-lint-final.txt` e
`output/context-overlap-final-regressions.txt`.

### Publicacao da segunda etapa

Verificacao publica as 20:42:17 de Sao Paulo: health/pagina 200, rotas de
metricas e estrategia 401 sem sessao, JS/CSS com hashes identicos ao build
local de producao. Deploy confirmado live no commit validado; sem nova migration
ou geracao autenticada/paga nesta verificacao. Ganho real de contexto e
persistencia sera avaliado nas proximas geracoes. Evidencia local:
`output/deploy/crossfit-context-d4d97bd-verified.json`.

### Primeira coleta real da segunda etapa

Janela continua de 08/11/2026, 20:43:00-20:45:28 de Sao Paulo: seis eventos,
uma analise e uma estrategia com seus eventos HTTP/cliente correlacionados.
Sem paginacao pendente. O check publico sem sessao das 20:42:15 ficou fora da
janela. Coleta de leitura, sem chamada paga ou geracao feita pelo agente.

Estrategia concluida as 20:45:05, 200 e aceita na primeira tentativa. Mesmo
gpt-5.4-mini-2026-03-17/medium/8000/hash de prompt e categoria TEXT_AND_IMAGE
da amostra anterior, das 15:19:14, antes desta segunda etapa.

| Medida                       | Antes    | Depois   | Diferenca         |
| ---------------------------- | -------- | -------- | ----------------- |
| Navegador                    | 36,342 s | 21,459 s | -14,883 s / 41,0% |
| HTTP completo                | 36,013 s | 21,226 s | -14,787 s         |
| Trabalho da rota             | 35,137 s | 20,333 s | -14,804 s         |
| Provedor                     | 23,812 s | 11,545 s | -12,267 s         |
| Navegador menos provedor     | 12,530 s | 9,914 s  | -2,616 s / 20,9%  |
| Contexto                     | 4,437 s  | 2,541 s  | -1,895 s / 42,7%  |
| Perfil, paralelo ao contexto | 1,051 s  | 2,674 s  | +1,623 s          |
| Persistencia                 | 4,259 s  | 3,437 s  | -0,822 s / 19,3%  |
| Criar versao                 | 1,427 s  | 0,728 s  | -0,698 s          |

Os eventos confirmam alvo/historico sobrepostos: alvo 1,949 s, historico
2,539 s e contexto total 2,541 s. O perfil agora terminou depois do contexto;
a maior espera do conjunto perfil/contexto foi 2,674 s vs 4,437 s antes.
Nao somar os tempos paralelos. O aumento do perfil deve ser acompanhado,
sem concluir por estes eventos que houve contencao de pool, indice lento ou
problema de regiao. Reserva/liberacao 0,888/0,887 s; conferencia pre-provedor
0,883 s. Na persistencia, demais chamadas 0,354-0,374 s, criar versao 0,728 s.
Chamadas Prisma podem conter varios comandos SQL e incluem rede/pool.

O total observado caiu, com reducao tambem fora do provedor. A maior parte
da diferenca total veio da variacao da chamada de IA: 11,545 s vs 23,812 s.
Input 8438 vs 8779, saida 3275 vs 7372, detalhe de raciocinio 2755 vs 6597
(incluido na saida), cache 0 vs 3968. Nao atribuir os 41% somente ao codigo,
nem toda a variacao da IA aos tokens. Uma amostra por versao nao comprova
treino identico, efeito causal, qualidade equivalente, media ou p95 do app.

Analise de imagem: navegador 30,336 s, provedor 15,128 s e persistencia 8,101 s;
aceita sem retry. A projecao de ID tambem se aplica ao arquivo de analise,
mas esta amostra nao isola seu efeito na gravacao.

Evidencias locais: `output/crossfit-production-20261108-post-context.jsonl`,
`output/crossfit-production-20261108-post-context-report.json` e
`output/crossfit-production-20261108-post-context-comparison.json`.
