# Otimizacao da estrategia CrossFit — 08/11/2026

## Motivo e comportamento

A primeira medicao completa de producao registrou 56,96 s de espera no navegador
para uma estrategia, incluindo 44,20 s na chamada ao provedor. Nao houve retry;
a resposta foi validada e persistida. Consulte a coleta em
[metricas-crossfit-2026-11-08.md](metricas-crossfit-2026-11-08.md).

O modelo padrao do StrategyCoachAgent passa de `gpt-5-mini` para o snapshot
`gpt-5.4-mini-2026-03-17`. Effort medium, teto 8000, prompts, contratos,
validacoes, duas tentativas maximas, contexto do atleta e persistencia continuam
iguais. Analise CrossFit e agentes HYROX mantem seus modelos e configuracoes.
O hash do prompt de estrategia continua
`sha256:485c8a780de5b7348dd005d0408ba921e4570578a61c30bafede4563a4dca6f9`.

Somente a configuracao do servidor pode sobrescrever o modelo. Para retornar ao
anterior, definir `CROSSFIT_STRATEGY_MODEL=gpt-5-mini` e republicar. Ausente ou
vazia, usa o snapshot acima. Valores model/effort enviados no corpo do POST nao
alteram o pedido de IA. Nao ha fallback silencioso para outro modelo nem retry
extra para falha de transporte.

## Comparacao controlada local

Mesmos inputs ficticios, prompt, medium, teto e validadores; ordem dos modelos
alternada entre casos. Tempos incluem o pedido ao provedor, validacao e correcao
quando necessaria. Excluem banco, autenticacao e navegador.

| Caso                 | gpt-5-mini | gpt-5.4-mini | Tentativas antigo/novo | Resultado final |
| -------------------- | ---------- | ------------ | ---------------------- | --------------- |
| AMRAP                | 23,49 s    | 6,69 s       | 1 / 1                  | Ambos validos   |
| Escadas              | 26,32 s    | 18,28 s      | 1 / 2                  | Ambos validos   |
| Intervalos pontuados | 32,62 s    | 19,30 s      | 1 / 2                  | Ambos validos   |

Mediana dos tres casos: 26,32 s para 18,28 s (30,5% menor). Uma repeticao por
caso/modelo nao comprova ganho estatistico nem a latencia final em producao.
Os retries do candidato foram integridade das escadas nos campos de estrategias
e target dos intervalos; validadores rejeitaram a primeira resposta e aceitaram
a segunda. Taxa observada 2/3 contra 0/3 do controle nessa pequena comparacao,
portanto acompanhar correcoes e falhas reais depois de publicar.

Quatro casos adicionais do candidato passaram na primeira tentativa:

- 1RM confirmado: 9,76 s; calculou 60/70 kg a partir de 1RM de 100 kg.
- PR sem tipo 1RM: 10,02 s; nao calculou pesos e pediu confirmacao da base.
- Movimento limitado: 8,30 s; ajustou quebras e incluiu aviso da limitacao.
- Capacidade unbroken de 22 BMU, dez por round: 11,14 s; priorizou dez direto
  nos primeiros rounds, quebra condicionada a perda de pegada no ultimo.

O candidato concluiu 7/7 casos, dois com correcao. A revisao local conferiu
volumes por round, pontuacao por snatches, falta de historico, PRs e campos de
carga. Foram observadas abreviacoes R1/R2 em saidas de escadas/capacidade,
apesar da orientacao de escrever Round; esse desvio de apresentacao permanece
um limite do ensaio, sem alterar o prompt ou relaxar validacao para esconde-lo.
No caso de movimento limitado houve quebras/aviso, sem substituicao explicita.
Validacao automatica e revisao local nao comprovam equivalencia de coaching
em todos os treinos; a qualidade pratica deve continuar sendo acompanhada.

## Custo e limites

Estimativa dos tres pares arquivados, usando tokens reportados e cache efetivo:

| Caso       | Antigo, USD | Novo, USD |
| ---------- | ----------- | --------- |
| AMRAP      | 0,00485     | 0,01069   |
| Escadas    | 0,00569     | 0,02683   |
| Intervalos | 0,00648     | 0,02627   |

Precos consultados na documentacao oficial em 08/11/2026, por milhao de tokens:
entrada/cache/saida de USD 0,25/0,025/2,00 para
[GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) e
USD 0,75/0,075/4,50 para
[GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
Tokens de raciocinio ja fazem parte da saida; nao foram somados outra vez.
Estimativas nao sao fatura nem previsao mensal, e o cache/retry muda por pedido.
O candidato foi mais caro nessa comparacao.

Ha dez geracoes arquivadas (tres controles, sete candidatas), doze chamadas
reportadas, sem acessar banco da aplicacao ou gravar treinos. Um ensaio
preliminar terminou com erro de caminho ao salvar o arquivo local depois da
geracao; foi excluido da comparacao e seu consumo nao foi estimado aqui.

Evidencias locais:
`output/performance/strategy-model-pilot-20261108.json` e
`output/performance/strategy-model-extended-20261108.json`.
Esses arquivos usam apenas fixtures ficticias e nao entram no repositorio.
O benchmark historico `scripts/benchmark-wod-latency.ts` fixa explicitamente
`gpt-5-mini` para preservar a comparacao low/medium de 03/11.

## Verificacao

Testes cobrem modelo padrao, rollback com retry/validacao intactos, configuracao
de servidor ignorando overrides de requisicao, metadados arquivados e as
regressoes existentes de CrossFit/HYROX. Os resultados finais de build, testes
e publicacao sao registrados na memoria do projeto no mesmo ciclo.

A confirmacao de ganho em producao requer novas estrategias reais no modelo
publicado, correlacionando navegador/HTTP/rota/tentativas. Nao somar os tempos
locais do modelo aos tempos de banco anteriores para anunciar um ganho medido.

Publicado em develop `c89809b` e main `10a7c69`. Render
`dep-dbob2iq9lscs73cqoldg` ficou `live` em 08/11/2026 14:29:56 de Sao Paulo.
Verificacao as 14:30:06: health/pagina 200, endpoint de metricas 401 sem sessao,
JS/CSS publicados iguais ao build local de producao. Nenhuma migration pendente
e nenhum erro de runtime retornado na consulta inicial. 922 testes aprovados,
70 testes PostgreSQL opt-in pulados; build/typecheck/lint/formatacao aprovados.
Evidencia local: `output/deploy/crossfit-strategy-model-10a7c69-verified.json`.
O modelo solicitado efetivamente em producao sera conferido no proximo evento
autenticado; nao foi gerado treino sintetico no banco para essa verificacao.
