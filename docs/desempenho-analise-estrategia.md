# Desempenho da analise e estrategia — 03/11/2026

## Escopo e mudancas

Fluxo CrossFit: envio → analise → contexto do atleta → estrategia → persistencia.
HYROX nao teve prompts, consultas ou comportamento alterados.

- Logs `wod_generation_timing` registram operacao, tipo de fonte, desfecho,
  duracao total do trabalho da rota, etapas e cada tentativa de IA. Usam relogio
  monotonico e nao incluem foto, prompt, resposta ou dados do atleta.
- As etapas sao `sourceRead`, `analysisRead`, `context`, `profile`, `ai` e
  `persistence`, conforme a operacao. `ai` inclui validacao/retry; cada tentativa
  tem sua propria duracao e status `received`/`failed`. Resposta recebida ainda
  pode ser rejeitada pela validacao. A reserva e sua liberacao entram no total.
- O total da rota exclui autenticacao, serializacao e transferencia HTTP. O log
  HTTP existente do Fastify fornece o tempo da requisicao no servidor. Para
  excecoes ainda nao traduzidas pelo error handler, `statusCode` fica null e
  `outcome` fica failed; correlacionar pelo reqId para obter o HTTP definitivo.
- Tentativas que receberam resposta ganham `durationMs` nos metadados arquivados.
  Falhas de transporte sao medidas no log, sem inventar resposta/tokens nem
  adicionar retry. Metadados antigos continuam legiveis; nenhuma migration.
- Historico de ate 100 treinos/90 dias usa `select`: sem imagem, texto fonte,
  respostas brutas ou campos nao utilizados. Mantidos scores, estrategia anterior,
  movimentos, PRs, contagens e algoritmo de similaridade. O WOD atual continua
  completo para preservar o versionamento da fonte. Leituras GET de analise e
  estrategia tambem verificam propriedade sem carregar a imagem.
- Novos PNGs com pelo menos 128 KiB podem virar WebP sem perda, na mesma resolucao,
  antes de salvar. Apenas substitui se economizar pelo menos 10%. Limite de 8 MP,
  effort 1 e timeout de codificacao de 1 s limitam o trabalho extra. Pequenos,
  animados, 16 bits, outros formatos, erros ou ganhos insuficientes preservam o
  original. JPEG/HEIC/WebP e imagens ja salvas nao sao reprocessados. O upload do
  navegador continua original; a economia beneficia banco, historico e envio a IA.
- Estrategia continua `gpt-5-mini`, effort medium e teto 8000. Analise continua
  effort low/teto 2500. Opcao de effort na funcao serve a comparacao offline;
  nenhuma rota publica permite trocar esse parametro.
- Prompts e validators de producao foram preservados. O experimento de requisitos
  por campo descrito abaixo foi retirado por nao demonstrar ganho no padrao medium.
  Nao ha truncamento/fallback de respostas invalidas.

## Medicoes reais locais

Chamadas diretas ao provedor, dados ficticios, sem banco da aplicacao ou gravacao
de treinos. Os tempos incluem rede ate a OpenAI, geracao e validacao local, mas
nao o fluxo HTTP/banco completo. Foram 28 chamadas ao provedor: 18 na comparacao
inicial, 6 na verificacao dos intervalados e 4 na analise de texto/foto.

### Analise do mesmo treino de escadas

Imagem sintetica em `tests/fixtures/wod-ladder.png`, inspecionada antes do OCR.

| Entrada | Tempos            | Resultado                       |
| ------- | ----------------- | ------------------------------- |
| Texto   | 16,55 s e 13,50 s | 2/2 validos; uma tentativa cada |
| Foto    | 17,63 s e 17,94 s | 2/2 validos; uma tentativa cada |

Conferidos rounds 21/21/12, 15/15/10, 9/9/8; nenhuma conversao em AMRAP.
Isso comprova OCR real dessa imagem sintetica; nao representa todas as fotos.

### Estrategia: comparacao inicial

Tres casos (AMRAP, escadas, intervalos pontuados), duas repeticoes por effort,
ordem alternada. p50/p95 por nearest rank; tempos de sucesso excluem falhas.

| Effort | Validos | Geracoes com retry | p50 dos validos | p95 de todas, incluindo falhas |
| ------ | ------- | ------------------ | --------------- | ------------------------------ |
| low    | 4/6     | 5/6                | 16,65 s         | 22,56 s                        |
| medium | 5/6     | 1/6                | 33,22 s         | 55,10 s                        |

As tres falhas finais foram nos intervalados: goal generico em low (duas vezes)
e target fora da regra de pontuacao em medium (uma vez). As respostas invalidas
continuaram rejeitadas. Mantido medium: velocidade de low nao justifica a perda
de confiabilidade observada nesta pequena amostra.

### Experimento descartado: requisitos explicitos dos intervalados

Testou-se acrescentar requisitos de goal, target, descanso e pacing por campo
ao contexto dos intervalados reconhecidos integralmente pelo parser existente.

Somente esse caso, duas repeticoes por effort: low passou 2/2 (9,67 s e 20,16 s;
um retry), medium passou 1/2 (53,73 s; outra geracao falhou apos 63,66 s).
Amostra pequena e variavel: nao comprova melhoria estatistica de latencia nem
equivalencia de coaching. O motivo de retry observado incluiu texto de estrategia
acima de 110 caracteres; uma correcao posterior voltou a perder o goal correto.
Essas falhas permanecem rejeitadas, documentadas e nao autorizam trocar o padrao.
O experimento nao melhorou a taxa de sucesso em medium nesta amostra e seus tempos
foram maiores. A orientacao adicional foi retirada antes da entrega; o script
final reproduz o prompt de producao preservado, nao esse experimento descartado.

### Compressao sem perda

Verificacao em tres PNGs locais, comparando pixels decodificados:

- Print de QA: 154.922 → 63.876 bytes (58,77% menor), aproximadamente 166 ms;
  pixels identicos. E uma medicao desse print, nao uma media de todas as imagens.
- Imagem de treino pequena (19.296 bytes): preservada, sem codificacao extra.
- Print alto de 8,4 MP: preservado em aproximadamente 1 ms pelo limite de pixels.
  Na exploracao inicial com limite maior ele consumiu cerca de 3 s sem economia;
  isso motivou os limites atuais.

Nao ha percentual medido de aceleracao total em producao. A reducao do trafego
de historico e estrutural; seu ganho em segundos depende dos dados e do banco.
As novas medidas permitirao separar esses componentes apos publicacao autorizada.

## Reproducao e evidencias

Compilar os pacotes antes dos testes/scripts. Os scripts com `--live` consomem
creditos de IA; nao consultam o banco e usam somente fixtures fixas.

PowerShell na raiz do projeto:

```powershell
pnpm build
$wodBenchRoot = (Get-Location).Path
$wodBenchEnv = Join-Path $wodBenchRoot '.env'
pnpm --filter @wod-coach-ai/api exec tsx "--env-file=$wodBenchEnv" "$wodBenchRoot/scripts/benchmark-wod-latency.ts" --live --repeats=2
pnpm --filter @wod-coach-ai/api exec tsx "--env-file=$wodBenchEnv" "$wodBenchRoot/scripts/benchmark-wod-analysis.ts" --live
```

`--case=scored-intervals` restringe a comparacao; `--output=...` permite salvar
outra rodada sem sobrescrever a anterior. Relatorios incluem falhas, retries,
tokens, duracoes, inputs sinteticos e estrategias validas para revisao humana.

Artefatos locais desta rodada (output nao faz parte da implementacao):
`output/performance/wod-latency.json`, `wod-latency-interval-checklist.json`,
`wod-analysis-latency.json` e `image-optimization.json`.

Revisao de qualidade por coach e amostras maiores continuam necessarias antes
de mudar effort/modelo. Testes automatizados nao comprovam qualidade de coaching.

Referencias: [OpenAI — Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization),
[Reasoning](https://developers.openai.com/api/docs/guides/reasoning),
[sharp — WebP](https://sharp.pixelplumbing.com/api-output/#webp).

## Verificacao da entrega

- 784 testes passaram, incluindo regressao das rotas, preservacao de contexto,
  registro de tempos/falhas, upload multipart real com banco simulado e igualdade
  de pixels apos compressao.
- Build, typecheck, lint global/dos scripts e testes alterados, formatacao e
  `git diff --check` passaram. Permanece o aviso anterior de Fast Refresh em ui.tsx.
- 70 testes PostgreSQL opt-in nao executados: Docker indisponivel. Nenhum banco
  da aplicacao foi consultado, alterado ou migrado para esta verificacao.
- Verificacao local concluida antes da publicacao. Usuario autorizou commit e
  deploy em 03/11/2026; publicacao segue pelo fluxo origin/main do Render.
  A medicao de carregamento completo das paginas permanece fora deste escopo.
