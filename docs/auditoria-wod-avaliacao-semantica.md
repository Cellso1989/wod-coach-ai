# Avaliacao semantica CrossFit: corpus e criterio de aceite

Preparado em 2026-10-05. Protocolo ainda NAO executado com provedor real.
Testes com JSON simulado comprovam validacao/persistencia, nao qualidade de OCR
ou adequacao de coaching. Nao ha imagens reais de referencia neste corpus.
Nao usar producao, dados pessoais ou provedor pago sem autorizacao especifica.

## Casos de referencia

| ID | Fonte ou contexto literal | Resultado a conferir |
| --- | --- | --- |
| S1 | `For Time\n10 Burpees\n400m Run\n20 cal Row` | FOR_TIME, janela null, ordem Burpee/Run/Row, volumes 10 reps/400 metros/20 calorias; nao inventar time cap. |
| S2 | `Buy-in: 400m Run; 2 rounds: 5 Back Squat 40/60kg; Buy-out: 5 Burpee` | Quatro blocos: Run, Squat 40kg, Squat 60kg, Burpee; Squat agregado 10 reps. Nao duplicar buy-in/out nem converter dois rounds em quatro ciclos. Time cap nao informado. |
| S3 | `Back Squat: 5 reps 70%, 3 reps 80%, 2 reps 85% do 1RM` e PR `Back-Squats: 100kg` | Tres sets na ordem, total 10 reps; se sugerir como escrito, 70/80/85kg. Avisar que modalidade do PR nao esta tipada; adaptacao exige identificacao e motivo visiveis. |
| S4 | `E2MOM 6 min: 400m Run` | Tres intervalos, 1200 metros agregados, sem confundir janela de dois minutos com descanso prescrito. |
| S5 | WOD `10 Front Squat`; unico PR `Back Squat: 100kg` | Nao usar Back Squat como PR de Front Squat. Sem PR proprio, orientacao por RPE/carga prescrita e recomendacao numerica null. |
| S6 | WOD `AMRAP 12: 6 Pull-up + 12 Air Squat`; atleta informa que nao consegue Pull-up, sem lesao informada nem historico | Substituicao explicita pode ser apropriada, nao deve ser bloqueada por nao constar no WOD. Nao inventar lesao, tratamento, historico, PR ou certeza de resultado. Julgar volumes, stimulus e viabilidade com coach. |
| S7 | `AMRAP 10: 10 T2B + 20 DU`; PRs `Toes-to-Bar: 22 reps`, `Double unders: 80 reps` | Reconhecer aliases sem transformar PR de repeticoes em peso ou 1RM; plano de quebras coerente com capacidade, sem afirmar resultado futuro como fato. |
| S8 | `Back Squat 3 sets: 5 reps 70-75% do 1RM, descanso 2 min` | Preservar faixa e descanso; nao tratar faixa como percentual unico. Caso fora do parser percentual deterministico atual, revisao manual obrigatoria. |

S2/S3/S4 possuem fixtures de contrato em tests/fixtures/wod-format-cases.ts.
Essas fixtures nao sao prova de extracao real. S2 historica inclui durationMinutes
15 para exercitar persistencia; esse valor NAO e gabarito semantico da fonte,
que nao fornece time cap. Nao enfraquecer testes transacionais para confundir
persistencia com fidelidade da interpretacao.

## Amostra OCR Necessaria

Solicitar imagens reais consentidas, sem nomes/contatos: quadro limpo com S1,
quadro com varios blocos S2, percentuais S3, unidades kg/lb e foto com reflexo,
rotacao ou trecho ilegivel. Para cada imagem, duas transcricoes humanas devem
concordar no gabarito ou marcar o trecho como ambiguo antes da chamada do modelo.
Imagem ilegivel deve produzir incerteza/solicitacao de confirmacao, nao completar
numeros por suposicao. Nenhuma imagem sintetica/mock conta como teste OCR real.

## Execucao Controlada

1. Autorizar ambiente descartavel, modelo e teto de custo; nao alterar defaults
   de producao para o experimento. Limitar execucao a tres repeticoes por caso,
   incluindo analise inicial, reanalise da mesma fonte e estrategia com contexto.
2. Registrar ID, hash/versao do codigo, fonte/gabarito, perfil/contexto literal,
   modelo, hash do prompt, responseId, tokens, tentativas, latencia, JSON bruto,
   JSON validado, status HTTP e snapshots antes/depois. Remover identificadores
   pessoais/chaves antes de compartilhar os resultados.
3. Conferir formato, janela, movimentos/aliases, ordem, volumes, cargas por bloco,
   descanso, extracao e omissoes contra a fonte. Uma resposta internamente
   coerente ainda pode estar errada em relacao a imagem/texto.
4. Coach revisa pacing, quebras, recuperacao, escala, transicoes, alvo, intensidade,
   uso do historico e avisos. Dar nota 0 (inadequado), 1 (parcial) ou 2 (adequado)
   por dimensao, com motivo e trecho da resposta. Dados ausentes nao autorizam
   inventar evidencias. Este roteiro nao prescreve conduta clinica.
5. Reportar separado: aceites, falhas semanticas aceitas indevidamente, respostas
   corretas rejeitadas, retries, custo e casos inconclusivos. Nao considerar 502
   como coaching aprovado. Verificar que rejeicoes deixam estado/historico intactos.
6. Qualquer omissao de bloco, troca de peso/unidade/percentual ou PR inventado
   impede encerrar o caso. Qualquer nota 0 de coaching exige revisao. Tres amostras
   sem falha nao certificam comportamento universal nem calibracao da confidence.

## Decisoes de Produto Ainda Abertas

- PR precisa de modalidade tipada (1RM, carga para N reps, recorde de reps etc.)
  e eventual confirmacao do atleta. Nao inferir 1RM por unidade kg/lb. O aviso
  atual torna a limitacao visivel, mas nao supre o dado ausente.
- Arredondamento real depende das anilhas/equipamento. A verificacao numerica
  atual confere conta para 0.1 da unidade, nao disponibilidade de equipamento.
- Parsers de carga livre e fontes complexas precisam de gramatica/gabaritos
  aprovados antes de virar rejeicao automatica ampla. Faixas e escalas legitimas
  nao devem ser reinterpretadas silenciosamente.
- Guardas lexicais nao equivalem a entendimento de toda linguagem: pesos por
  extenso, parafrases e outros fatos inventados ainda precisam de avaliacao.

Encerramento: somente apos executar e revisar este protocolo, resolver falhas
encontradas e registrar explicitamente as decisoes/limites aceitos. Nao executado
na rodada local de correcoes deterministicas C7b2c.
