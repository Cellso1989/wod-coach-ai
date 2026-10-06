# Matriz de analise e reanalise - C7a

## Protocolo automatizado

Precondicao comum: WOD CrossFit pertencente ao atleta autenticado, fonte textual
salva e resultado existente. Transporte IA e banco simulados na matriz de API;
respostas sao fixtures controladas, nao geracoes do provedor.

Para cada linha positiva abaixo, executar duas variacoes:

1. Inicial: analisar, salvar e gerar estrategia.
2. Reanalise: analisar e gerar estrategia anterior; reanalisar e gerar novamente.

Resultado esperado em ambas: fonte e score identicos; formato, duracao, ordem,
rounds/blocos, reps, metros, calorias e descricoes de carga preservados. Texto
inteiro enviado ao analisador. Nova analise invalida somente a estrategia ativa;
snapshots anteriores permanecem. Contexto, perfil e analise corrente chegam ao
snapshot de entrada da nova estrategia, sem misturar versoes.

Fixtures: tests/fixtures/wod-format-cases.ts. As 20 variacoes ficam no teste
"preserves format/source/structure/context" de
tests/integration/wod-reanalysis.test.ts.

| Caso | Fonte e estrutura verificadas | Expectativa especifica |
| --- | --- | --- |
| AMRAP | 15 min, Row/Burpee, meta 8 rounds | Meta nao vira contagem fixa; rounds null |
| FOR_TIME | Escada 21-15-9 Burpee, cap 12 min | Tres blocos em ordem; total 45 |
| EMOM | Seis minutos alternados Row/Burpee | Seis blocos; 30 cal e 15 reps |
| E2MOM | 400m Run por intervalo, seis minutos | Tres blocos; total 1200m |
| CHIPPER | 1000m Row e 50 Burpee, cap 20 min | Metros nao viram calorias; sem rounds inventados |
| ROUNDS_FOR_TIME | Tres rounds de Run/Burpee | 400m/5 reps por round; 1200m/15 no resumo |
| STRENGTH | Back Squat 5/3/2, 70/80/85% do 1RM | Percentuais por set, sem conversao inventada para kg |
| INTERVAL | Tres intervalos de Run com descanso | Tres blocos; volume total separado do volume por bloco |
| Blocos mistos | Buy-in, dois rounds 40/60kg, buy-out | Quatro blocos, labels e cargas diferentes preservados |
| Entrada longa | Texto de 10000 caracteres com AMRAP ao final | Mensagem ao analisador e fonte salva sem corte |
| Fonte simples (C7b2a) | For Time, linhas 10 Burpees / 400m Run / 20 cal Row | Movimentos/volumes do resumo correspondem a fonte; snapshot de estrategia preservado |

## Rejeicoes e recuperacao

Precondicao: repetir com WOD ainda nao analisado e com analise/estrategia salvas.
Passos: enviar duas respostas inconsistentes no transporte; consultar estado.
Expectativa: 502 apos o retry corretivo existente, sem qualquer mudanca no WOD,
score, projecoes ativas, movimentos ou historico. Em PostgreSQL, reserva liberada.

| Caso | Cobertura | Resultado |
| --- | --- | --- |
| Totais incoerentes ou movimento ausente do resumo | Unitario, API inicial/reanalise, PostgreSQL para total | Rejeitado, estado anterior preservado |
| Reps, metros ou calorias divergentes | Unitario; API/PG para reps | Soma de todos os blocos conferida |
| Volume parcial desconhecido com total conhecido | Unitario | Rejeitado; total desconhecido pode permanecer null |
| Categoria, carga uniforme ou nomes duplicados incoerentes | Unitario; API para carga | Rejeitado pelo retry de schema |
| Numeracao fora de ordem sem contagem no texto | Unitario | Rejeitado mesmo sem N rounds explicito |
| Reconstrucao com nome trocado/carga escondida ou variavel | Unitario | Sem inferencia silenciosa; exige resposta completa |
| Primeira resposta incoerente, segunda corrigida | Unitario | Apenas a correcao e retornada |
| Tres reanalises sucessivas | API | Quatro versoes de analise/estrategia, anteriores imutaveis |
| JSON invalido, campos vazios/ausentes, timeout e incomplete | Suites anteriores de agente, transporte, API e PG repetidas | Sem persistencia parcial; timeout sem retry corretivo |
| Navegacao, refresh, contexto antigo e geracao concorrente | 24 E2E anteriores repetidos | Estado e exibicao protegidos; endpoints simulados |

## Resultado e limites

C7a: 266 testes gerais passaram, com 38 PG opt-in pulados nessa execucao;
38 passaram separadamente em PostgreSQL descartavel, sem drift de schema.
24 E2E passaram. Typecheck, build, lint global e lint dos arquivos alterados
passaram; permanece somente o aviso preexistente de Fast Refresh em ui.tsx.
Nenhuma chamada paga ou migration no banco da aplicacao foi executada.

Esta matriz prova contratos, passagem de dados e protecao contra inconsistencia
interna. Nao mede a qualidade de extracao OCR, interpretacao do modelo nem a
correcao do coaching gerado. Uma resposta com movimentos/cargas inventados, mas
coerentes entre resumo e blocos, ainda pode passar. Descricoes de cargas variaveis
sao texto livre; nao ha parser universal de percentuais, kg/lb ou prescricao.

C7a comitada: 57a1be3. C7b1 protege agora a existencia de base para o campo
loadRecommendation: PR positivo/finito de movimento do WOD em kg/kgs/lb/lbs.
Treze unitarios, sete casos de API e quatro PostgreSQL novos protegem o campo,
retry e snapshots. Total: 286 testes gerais e 42 PostgreSQL passaram; typecheck,
build e lint passaram. E2E: 23/24 na primeira execucao com seis workers, caso
de navegacao passou 3/3 isolado, repeticao com dois workers passou 24/24.
Ocorrencia sem causa confirmada documentada em auditoria-wod-pendencias.md;
nenhuma assertion ou espera de UI alterada para esconder a falha.

C7b2a acrescenta comparacao deterministica somente para fontes simples
integralmente reconhecidas: heading For Time/Chipper/AMRAP N min e uma linha
por movimento do vocabulario fechado. Omissao, movimento inventado, reps,
metros, calorias e unidade divergentes sao rejeitados; null nao substitui volume
explicito. Texto original nao pode ser sobrescrito pela transcricao gerada.
Notas/cargas/fases/escadas, nomes repetidos/desconhecidos ou Row/Run/HSW sem
unidade nao sao interpretados parcialmente. Testes tambem garantem esses limites.
20 unitarios novos, quatro API, dois PostgreSQL (omissao/volume inicial/reanalise)
e dois casos positivos API da matriz. Total: 312 gerais e 44 PG sem drift;
typecheck/build/lint e os 24 E2E anteriores passaram (dois workers, trace,
endpoints simulados). Esta etapa nao foi comitada nem publicada.

C7b2 restante permanece pendente: fidelidade semantica entre fonte/analise e entre
analise/PRs/perfil/estrategia. Ter um PR de carga nao valida todos os pesos,
movimentos, percentuais ou conversoes sugeridos, nem impede pesos inventados
em outros campos de texto. Fonte e resposta precisam de exemplos representativos,
incluindo imagens e aliases, antes de definir guardas que nao rejeitem escalas
ou substituicoes legitimas. Nao considerar a auditoria integral encerrada.
