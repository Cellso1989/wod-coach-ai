# Coleta CrossFit em 08/11/2026

## Publicacao verificada

- Correcao em develop: `eadfc58`; producao: `00c4be6`.
- Render: `dep-dboam8avcj2c7395s5bg`, status `live` em 08/11/2026,
  14:03:54 de Sao Paulo. O build anterior falhou por tipos Node ausentes no
  pacote coach-engine; dependencia, importacao e configuracao agora explicitas.
- Verificacao as 14:04:57: `/health` e `/wods` 200; POST nao autenticado em
  `/api/wod-generation-metrics` 401. JS/CSS publicados identicos ao build local
  com API na mesma origem, incluindo cabecalho e endpoint da nova telemetria.
- Build completo sem cache, typecheck, lint, formatacao e 919 testes aprovados;
  70 testes PostgreSQL opt-in pulados sem banco descartavel. Nenhuma migration
  nova, alteracao de modelos/prompts ou chamada paga de IA nesta verificacao.

## Historico disponivel antes da publicacao

Consulta continua ao Render de 01/11/2026 00:00 a 08/11/2026 14:03:54,
horario de Sao Paulo, filtrando `wod_generation`, sem filtro por sucesso ou
lentidao. Foram retornados 16 eventos, sem pagina adicional, entre 03/11 16:56
e 06/11 22:36. Sao logs antigos, sem schemaVersion 2, tempo HTTP completo ou
medicao do navegador. Todos os 16 eventos encontrados indicam sucesso;
isso nao comprova ausencia de falhas nao registradas nem representa todos os
usuarios/requisicoes do periodo.

Tempos em segundos. Percentis pelo elemento de ordem `ceil(p * n)`.

| Operacao   | Amostras | Rota p50 | Rota p95/max | IA p50 | Persistencia p50 |
| ---------- | -------- | -------- | ------------ | ------ | ---------------- |
| Analise    | 9        | 32,9     | 43,1         | 21,5   | 7,9              |
| Estrategia | 7        | 46,8     | 80,1         | 35,0   | 3,9              |

Uma das sete estrategias tem duas chamadas de IA; as outras seis e as nove
analises tem uma chamada. Nos logs antigos, `received` apenas indica resposta
recebida: nao identifica motivo de rejeicao, validacao aceita ou recuperacao.
O resultado observado de 1/7 estrategias com segunda chamada (14,3%) serve
somente como indicador historico; nao substitui a taxa da nova telemetria.
Tokens, modelos/efforts/hashes e motivos de correcao nao estao disponiveis
nesses eventos.

A etapa IA representa 63,7% da soma dos tempos das rotas de analise e 77,0%
das rotas de estrategia nessa amostra. O contexto de estrategia tem mediana
de 4,3 s. Esses dados apontam onde investigar, sem comprovar uma otimizacao.
Nao somar medianas/p95 de analise e estrategia para anunciar espera total.
Com nove/sete amostras, p95 coincide com o maximo e e instavel.

## Nova telemetria

Consulta continua apos `live`, de 08/11/2026 14:03:54 a 14:06:18 de Sao Paulo:
zero eventos `wod_generation*`, sem pagina adicional. Portanto, nesta janela,
nao ha amostra para tempos HTTP/cliente, taxa/motivos de correcao, recuperacao
ou tokens. Ausencia de amostra nao equivale a taxa zero.

Os eventos antigos foram exportados e passados pelo relatorio oficial, que
os marcou corretamente como 16 eventos legados excluidos dos novos indicadores.
O resumo historico acima foi calculado separadamente, sem inventar validacoes
nem converter esses eventos para schemaVersion 2.

Nao foram criados treinos sinteticos, usadas sessoes autenticadas ou feitas
chamadas de IA para preencher a amostra. A coleta seguinte deve incluir uso
real de analisar/gerar estrategia depois desta publicacao e seguir
[o procedimento de exportacao e relatorio](medicao-crossfit-producao.md#coleta-e-relatorio).
Nenhum coletor em segundo plano foi configurado; os eventos ficam nos logs
Render e precisam ser exportados novamente para atualizar o relatorio.

## Primeira execucao com telemetria completa

Coleta continua apos a publicacao ate 08/11/2026 14:17:24 de Sao Paulo:
seis eventos correlacionados, uma analise (14:14:51) e uma estrategia
(14:16:31), ambas de texto e persistidas com sucesso. Cada uma foi aceita
na primeira resposta; nenhuma correcao foi solicitada ou tentada.

| Medicao                                 | Analise | Estrategia |
| --------------------------------------- | ------- | ---------- |
| Espera no navegador                     | 22,34 s | 56,96 s    |
| HTTP no servidor                        | 22,04 s | 56,66 s    |
| Trabalho da rota                        | 21,16 s | 55,78 s    |
| Chamada ao provedor                     | 9,62 s  | 44,20 s    |
| Etapa IA, incluindo verificacoes locais | 10,70 s | 45,07 s    |
| Persistencia                            | 5,88 s  | 2,99 s     |

A estrategia usou `gpt-5-mini-2025-08-07`, effort medium, teto 8000;
8316 tokens de entrada, 3939 de saida (incluindo 3392 de raciocinio), cache
reportado zero. Contexto 4,22 s, perfil 0,87 s, leitura inicial 0,87 s.
A diferenca cliente-HTTP foi 0,30 s; o processo tinha 761 s ao responder.
Nesta execucao, os dados apontam a chamada de IA como principal componente,
sem retry observado. Nao sao evidencia de distribuicao populacional, de
causalidade dos tokens ou de uma melhoria ja aplicada.

Evidencias locais: `output/crossfit-production-20261108-first-pair.jsonl` e
`output/crossfit-production-20261108-first-pair-report.json`. Os indicadores
de p50/p95 desse relatorio representam apenas um evento por operacao.

## Evidencias locais anteriores

- `output/deploy/crossfit-build-fix-00c4be6-verified.json`: deploy e hashes.
- `output/crossfit-production-legacy-20261101-08.jsonl`: 16 eventos antigos.
- `output/crossfit-production-legacy-summary.json`: calculo historico separado.
- `output/crossfit-production-legacy-report.json`: exclusao pelo relatorio oficial.
- `output/crossfit-production-new-telemetry-collection.json`: janela nova vazia.

Evidencias de execucao ficam locais; o repositorio registra este resumo sem
conteudo de treinos, usuarios ou respostas da IA. A proxima etapa e obter a
amostra nova antes de otimizar modelos ou prompts.
