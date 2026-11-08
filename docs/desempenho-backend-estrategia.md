# Desempenho do backend da estrategia CrossFit

Implementacao local em 08/11/2026. Usuario autorizou explicitamente commit,
push e publicacao deste ajuste; verificacao do deploy pendente.

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
