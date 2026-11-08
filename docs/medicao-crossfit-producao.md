# Medicao CrossFit: producao e correcoes da IA

Implementacao local em 08/11/2026. A coleta real depende da publicacao autorizada
deste codigo e do uso posterior. Os testes locais usam dados ficticios e nao
demonstram a latencia de producao nem uma reducao dos 150 segundos relatados.

## Escopo

Somente geracao CrossFit: `POST /api/wods/:id/analyze` e
`POST /api/wods/:id/strategy`. Modelos, efforts, tetos de tokens, prompts,
validators, quantidade de tentativas e regras de persistencia foram mantidos.
HYROX nao envia os novos eventos. O transporte compartilhado apenas passa a ler
detalhes opcionais de tokens do provedor; nao muda o pedido de IA.

Nao ha migration, tabela de telemetria ou dependencia externa nova. Sao logs JSON
do backend e uma notificacao HTTP pequena do navegador, depois de cada operacao.
Ela nao e aguardada pela interface, nao tem retry, nao invalida o cache de
navegacao e tem timeout de 5 segundos. Falha da telemetria preserva o resultado.

## Eventos e limites das medicoes

| Evento                                          | O que mede                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `wod_generation_timing`, schemaVersion 2        | Trabalho da rota, incluindo reserva/liberacao, consultas/contexto, IA, validacao e persistencia                     |
| `wod_generation_http_timing`, schemaVersion 1   | Requisicao no Fastify, desde onRequest ate onResponse: inclui autenticacao, tratamento final de erro e serializacao |
| `wod_generation_client_timing`, schemaVersion 1 | Espera no navegador pelo POST e leitura/parse da resposta, tanto em sucesso quanto em falha                         |

O tempo do navegador exclui upload inicial do treino, leitura inicial da pagina,
renderizacao React e tempo entre o atleta clicar em analisar e depois em gerar
estrategia. Analise e estrategia continuam sendo operacoes distintas. Nao somar
medianas/p95 para anunciar tempo ponta a ponta.

O tempo HTTP comeca quando o processo recebe a requisicao: nao mede diretamente
DNS/TLS, espera no proxy nem inicializacao anterior ao recebimento. `uptimeSeconds`
indica idade do processo; nao comprova cold start. A diferenca cliente menos HTTP
inclui essas esperas, transferencia/parse do corpo e ruido de medicao; nao e
uma medicao pura de rede. A diferenca HTTP menos trabalho ajuda a identificar o
tempo fora da funcao da rota, mas nao isola autenticacao de serializacao.

Cada POST do navegador gera um UUID v4 aleatorio em `X-Wod-Measurement-Id`.
O mesmo `measurementId` aparece nos eventos da operacao. Clientes antigos sem
esse cabecalho continuam funcionando; correlacionar os dois eventos de servidor
por `instanceId` + `requestId`. O identificador da instancia evita colisoes de
reqId depois de reiniciar/escalar. Sem crypto.randomUUID, o navegador funciona
sem a medicao cliente.

Os tempos do cliente sao informados pelo cliente e nao sao evidencia de sucesso,
auditoria, cobranca ou autorizacao. Podem ser falsificados. O endpoint exige
autenticacao/aprovacao, aceita somente os quatro campos previstos, limita o corpo
a 1 KiB, duracao a 30 minutos e trafego a 30 envios/minuto por IP. Nao escreve no
banco. Logout, troca de conta, retorno a conta anterior e acesso negado descartam
medicoes ainda pendentes. Uma notificacao ja enviada pode ser perdida ou falhar.

### Operacoes de banco da estrategia

Incremento local de 08/11/2026 adiciona `databaseOperations` opcional ao evento
de trabalho v2, sem invalidar logs anteriores. Cada chamada registra somente
`operation`, `durationMs` e `status` (succeeded/failed), com rotulos fixos:
reserva/conferencia/liberacao, alvo/historico/check-ins/PRs, perfil e operacoes
da persistencia/versionamento. Nao registra SQL, parametros ou retornos.

Uma operacao Prisma pode executar varios comandos SQL. O tempo inclui espera
de pool/rede e execucao da chamada inteira; nao e uma medicao isolada do servidor
PostgreSQL. O relatorio resume cada rotulo por chamada, incluindo quantidade de
falhas. Contexto e perfil agora se sobrepoem: nao somar suas duracoes nem as
distribuicoes para estimar o tempo total. O total de persistencia tambem inclui
entrada/commit da transacao alem das chamadas internas. ANALYSIS e logs antigos
podem nao ter operacoes detalhadas; ausencia nao significa custo zero.

Detalhes e comparacao local em [desempenho-backend-estrategia.md](desempenho-backend-estrategia.md).

## Tentativas e motivos de correcao

`attempts` registra tempo, received/failed, modelo solicitado/reportado, effort,
teto, hash do prompt de sistema e uso de tokens quando reportado. `received` nao
significa validado. Falha de transporte nao ganha tokens estimados nem retry.

`validations` registra, por resposta recebida:

- `status`: accepted ou rejected;
- `reason`: invalid_json, schema, empty_response ou null quando aceita;
- `issues`: ate 12 pares de campo de primeiro nivel e codigo Zod;
- `issueCount`: quantidade total de problemas, mesmo quando a lista foi limitada;
- `willRetry`: se a rejeicao solicitou uma tentativa corretiva;
- `durationMs`: parsing, normalizacao e validacao local.

Campos sao escolhidos de uma lista fixa; chaves desconhecidas viram `other`.
Nao sao copiados textos de erro, valores, nomes de movimentos ou caminhos
dinamicos. `rounds:custom`, por exemplo, indica rejeicao semantica de estrutura;
`target:too_big`, excesso de comprimento; nao identifica sozinho toda a causa.
O retry continua recebendo seu feedback original, sem mudar o prompt.

Resposta vazia e falha de transporte continuam terminais, sem nova tentativa.
O resumo `aiSummary` distingue correcao solicitada, efetivamente tentada e
recuperada. Uma resposta aceita depois da correcao pode ainda falhar ao salvar
ou encontrar conflito; isso nao deve ser contado como estrategia persistida.

Tokens `reasoningTokens` e `cachedInputTokens` sao detalhes opcionais do uso:
ja estao incluidos em outputTokens/inputTokens, respectivamente. Nao somar de
novo. Ausencia e desconhecida, nao zero. O total arquivado preexistente continua
somando as tres contagens principais; detalhes ficam em cada tentativa.
Falhas/incomplete podem consumir tokens sem reporta-los nesta telemetria;
o relatorio nao e uma fatura.

Os novos eventos nao incluem usuario, ID do treino, foto, prescricao, perfil,
PRs, prompts, respostas ou mensagens livres. Avisos de resposta invalida das
duas rotas CrossFit tambem deixam de imprimir resposta bruta/erro Zod, que
podiam conter esses valores. Logs HTTP e outros logs preexistentes do app
continuam sujeitos a sua politica de acesso e retencao.

## Coleta e relatorio

1. Publicar somente depois de autorizacao de commit/push/deploy deste conjunto.
2. Exportar uma janela continua dos logs Render, incluindo os tres eventos acima.
   Nao selecionar somente casos lentos ou bem-sucedidos. Evitar misturar QA e
   producao; manter o periodo e a versao publicada junto ao arquivo.
3. Guardar o arquivo localmente como JSONL UTF-8. O leitor aceita JSON Pino puro,
   prefixos de timestamp e envelope JSON com `message` contendo o JSON original.
4. Executar na raiz:

```powershell
node scripts/summarize-wod-generation.mjs output/crossfit-production.jsonl
```

Aceita varios arquivos como argumentos e elimina duplicatas identificaveis.
No servidor, deduplicacao usa instancia + requisicao, sem confiar no UUID do
cliente. UUID reutilizado por mais de uma requisicao da mesma operacao fica
ambiguo e nao e usado para calcular o intervalo cliente-HTTP.
Nao chama a OpenAI, nao acessa banco e nao transmite os logs. A saida contem:

- p50/p95/max e numero de amostras para rota, HTTP, cliente, IA e etapas;
- grupos por ANALYSIS/STRATEGY, fonte e configuracao modelo/effort/hash;
- tempos com/sem correcao, motivos, campos/codigos e falhas;
- taxa de correcao = geracoes com segunda tentativa / geracoes que iniciaram IA;
- recuperacao = correcoes com resposta aceita / correcoes efetivamente tentadas;
- persistencias bem-sucedidas depois de correcao, separadas da recuperacao;
- contagens conhecidas de tokens e quantas tentativas nao possuem uso/detalhes;
- quantidade de pares cliente/HTTP e HTTP/trabalho correlacionados.

Falhas que iniciaram IA entram no denominador da taxa; 401/404/conflitos antes
da IA nao entram. Sem amostra, percentis e percentuais sao null. Eventos antigos
de trabalho sem schemaVersion 2 sao contados como excluidos: nao se presume que
uma resposta received foi aceita. Tipos/instancias diferentes nao sao unidos
somente porque repetiram req-1.

As distribuicoes incluem falhas observadas, nao somente sucessos. Diferencas
negativas cliente-HTTP sao contadas separadamente e excluidas dos percentis do
intervalo. Os campos de rejeicao contam somente as ate 12 issues registradas
por resposta. Uso conhecido parcial nao representa o custo total.

Uma janela cortada pode ter cliente sem HTTP, rota sem cliente ou operacoes
ainda em andamento. Processo encerrado antes do finally pode perder o evento
de trabalho inteiro; sem fila duravel, isso nao e um censo de todas as geracoes.
Bloqueio de rede, navegador fechado, cliente antigo ou troca de conta tambem
reduzem a cobertura cliente. Sempre informar as contagens e o periodo ao
apresentar resultados. p95 com poucas amostras e instavel.

## Decisao depois da coleta

- Se a maior parcela estiver em `ai` e a correcao for frequente, priorizar
  motivos/campos mais recorrentes e avaliar Structured Outputs em experimento.
- Se uma tentativa valida ja for lenta, comparar configuracoes com controle
  de qualidade, sem reduzir effort/teto indiscriminadamente.
- Se contexto/persistencia dominarem, medir consultas/pool antes de mudar SQL.
- Se cliente/HTTP divergirem muito, investigar rede, proxy, tamanho da resposta
  e inicializacao da hospedagem antes de atribuir tudo ao modelo.

Referencia de detalhes de uso: [OpenAI — Reasoning](https://developers.openai.com/api/docs/guides/reasoning).

## Verificacao local

- 919 testes unitarios/API aprovados, incluindo observacao real das duas rotas
  com IA/banco simulados, recuperacao/falha, reserva rejeitada antes da IA,
  isolamento de sessao, endpoint limitado e execucao do relatorio JSONL.
- 70 testes PostgreSQL opt-in pulados, sem base descartavel configurada.
- Build completo, typecheck, ESLint dos arquivos alterados, formatacao e
  `git diff --check` aprovados.
- Nenhuma chamada paga de IA, consulta/escrita no banco da aplicacao, migration,
  commit, push ou deploy neste ciclo. Sem ensaio de navegador nesta etapa;
  medicao cliente verificada por testes do transporte web com fetch simulado.
