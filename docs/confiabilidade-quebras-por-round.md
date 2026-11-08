# Confiabilidade: quebras por round

Primeiro incremento da frente de confiabilidade escolhida em 08/11/2026.
Publicado em develop `61976c2` e main `237b4a1`; deploy Render
`dep-dbobdb5g1s2s738bmfog` confirmado live em 08/11/2026.

## Falha reproduzida

Uma estrategia podia identificar corretamente Thrusters como `21-15-9 por
round`, mas escrever `R1: 7/7/7; R2: 7/7/7; R3: 9 direto`. O segundo round
prescreve 15 reps, enquanto a quebra soma 21. O guard anterior verificava a
escada no rotulo e produtos maiores que o maior round, sem conferir essa soma.
Assim, o JSON passava mesmo com a orientacao de execucao contraditoria.

Sete novas regressoes falharam antes da correcao, incluindo excesso/falta de
reps, multiplicacao, entrada separada por round e ausencia do retry esperado.

## Comportamento corrigido

Em escadas com volumes diferentes e uma ocorrencia do movimento por round,
conferir que a quebra numerica explicitamente vinculada a um round soma as
reps desse round. Tanto breakStrategy quanto movementStrategy usam o guard.

- Notacoes completas reconhecidas: `7/7/7`, `8 + 7`, `3x7`, `3×7`, `9`,
  `9 reps`, `9 direto`, `9 unbroken`, inclusive Unicode NFKC.
- Escopo inline: `Round 2: ...`, `R2: ...`, `Bloco 2: ...`, `Set 2: ...`;
  instrucoes separadas por ponto e virgula.
- Escopo por rotulo: `Thrusters (Round 2 - 15 reps)`, com a quebra na primeira
  instrucao. Usar o numero real do round, inclusive apos buy-in.
- Uma soma diferente entra no retry corretivo existente, com o volume esperado
  no feedback. Se as duas respostas forem invalidas, retornar 502 e preservar
  estrategia ativa, analise e todas as versoes anteriores. Uma resposta corrigida
  cria somente uma nova versao.

Nao muda modelos, prompts, efforts, tetos, numero de tentativas, contratos de
interface, banco ou regras de ranking. Nao reescreve estrategias ja salvas.
HYROX nao usa esse guard de estrategia CrossFit.

## Limites

Isso e uma verificacao aritmetica estreita, nao um parser geral de coaching.
Nao inferir contagens de segundos, pesos, alternativas, condicionais ou texto
livre. Exemplos como `Round 2: 20s/10s` e `Quebre antes da falha` ficam fora
da nova gramatica. Numeros fora de inteiros seguros tambem ficam fora dela.
Entradas com mais de uma ocorrencia do movimento no mesmo bloco nao recebem
a nova verificacao, pois nao ha associacao unica para a quebra.

O guard preexistente continua protegendo rotulos agregados e blocos maiores
que a escada. Rounds uniformes, quebras em prosa e outras estruturas ainda
dependem das demais validacoes e da avaliacao de coaching. Esta etapa nao
encerra a auditoria C7 nem comprova OCR real ou qualidade universal do modelo.

## Verificacao

- Suite geral: 936 testes aprovados, 70 PostgreSQL opt-in pulados sem base
  descartavel configurada. Build, typecheck, ESLint, Prettier e diff check
  aprovados. Sem teste de navegador por nao alterar a interface.
- Testes unitarios cobrem rejeicao, retry/recuperacao, contas validas, aliases
  de round, numeracao apos buy-in e preservacao de conselhos fora da gramatica.
- Testes de API com banco/IA simulados cobrem geracao inicial e regeneracao:
  erro preserva estado/versoes, libera reserva e nunca publica plano invalido;
  recuperacao cria uma versao valida sem alterar a analise.
- Reaplicado somente o guard de escadas a dez respostas reais do provedor,
  de fixtures ficticias ja arquivadas: nenhuma nova rejeicao. Isso nao equivale
  a revalidar toda a estrategia nem a uma revisao humana de coach.
- Nenhuma chamada paga, acesso ao banco da aplicacao, migration, OCR real ou
  mudanca visual nesta etapa. Cenarios de texto extraido usam fixtures.

Evidencias locais: `output/reliability-round-breaks-before.txt`,
`output/reliability-round-breaks-focused.txt`,
`output/reliability-round-breaks-archived-replay.json` e verificacoes gerais
`output/reliability-round-breaks-{build,typecheck,tests}.txt`.

## Publicacao

Verificacao as 14:53:18 de Sao Paulo: health e pagina 200, rota de metricas
401 sem sessao e hashes de JS/CSS iguais ao build local de producao. Nao houve
nova migration ou chamada paga; guard exercitado pelos testes locais, sem
geracao autenticada de atleta para esta verificacao. Evidencia local:
`output/deploy/crossfit-round-breaks-237b4a1-verified.json`.
