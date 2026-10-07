# Validacao das correcoes de qualidade

Trabalho local na develop, iniciado em 2026-10-07. Sem commit, push ou deploy autorizado nesta rodada.

## Correcoes

- F01: o analisador nao trata Tempo ou duracao isolada como AMRAP. Preserva formatos e time caps explicitamente prescritos; uma escada compacta reconhecida sem AMRAP explicito nao pode virar repeticao continua. Formato realmente ambiguo pode ficar null com aviso. Os bloqueios de rounds, totais, ordem e publicacao de versoes continuam ativos, assim como o retry corretivo.
- F01: erro de resposta invalida retorna codigo WOD_ANALYSIS_INVALID_RESPONSE e orienta conferir a fonte, informar formato/time cap e tentar novamente. A resposta invalida nao substitui analise ou estrategia anteriores.
- F02: check-in rejeita tempo invalido antes do POST. Aceita vazio opcional, segundos inteiros ou minutos com dois digitos de segundos de 00 a 59. Rejeita fracionarios, partes adicionais e 12:99, sem conversao silenciosa. API tambem respeita o limite do inteiro PostgreSQL.
- Testes antigos: contrato atual de resultado opcional, persistencia apos recarga, mensagem de WOD vazio, loading especifico e estrategia automatica. A fixture PostgreSQL usa Back Squat 5-3-2, recuperando verificacoes de percentuais, PR tipado e adaptacao sem afrouxar os guards.
- Fixtures de historico de reanalise variam intensidade, nao o time cap explicito da mesma fonte. Historico antigo e invalidacao da estrategia continuam verificados.

## Evidencias locais

- API 4333, interface 5174 e PostgreSQL exclusivo 55432; instancias existentes e producao nao reutilizadas.
- Suite regular: 510 aprovados e 48 opt-in ignorados; inclui regressao API de preservacao do par salvo apos formato invalido por imagem.
- Navegador: 41 de 41 E2E aprovados na rodada final; inclui bloqueio de POST para tempo invalido e persistencia do resultado anterior. O timeout do roteiro local foi 60 s para comportar navegacoes e animacao de abertura; timeouts de producao nao foram alterados.
- PostgreSQL real: 48 aprovados e schema sem diferencas. IA simulada nesta suite.
- Build, lint e typecheck: 21 tarefas aprovadas, com warning preexistente de Fast Refresh em ui.tsx.
- Imagem real: tres POSTs ao provedor, uma analise e duas reanalises, retornaram 200. Rounds conferidos: 21/21/12, 15/15/10, 9/9/8; tres versoes de analise. Formatos: ROUNDS_FOR_TIME, null com aviso, ROUNDS_FOR_TIME. Duracao 12 min preservada.
- Estrategia real apos reanalise: POST 200 e GET persistido; Thrusters/T2B identificados como 21-15-9 por round e BMU como 12-10-8. Sem rotulos de execucao agregados em 45/45/30 reps.
- Resultados e scripts de reteste em output/qa-fixes. A auditoria original em output/qa permanece historica; suas falhas nao foram apagadas.
- A causa exata da resposta rejeitada no F01 original nao foi isolada: o reteste confirma o comportamento das novas protecoes, nao estabilidade universal do provedor.

## Smoke de homologacao e iPhone real

Pendente: URL de homologacao, configuracao equivalente ao Render e execucao em iPhone fisico. Nao declarar estes itens aprovados por causa de testes locais ou de viewport mobile.

1. Conferir branch/commit e assets publicados em homologacao. Usar banco e contas de teste, separados da producao.
2. Conferir migrations, pool/limites/conexao e variaveis equivalentes ao Render, sem copiar credenciais para o relatorio. Validar health apos cold start.
3. Em Safari no iPhone, cadastrar/logar, atualizar perfil e PR, salvar check-in 12:34 e recarregar. Confirmar erro ao tentar 12:99 e preservacao do resultado anterior.
4. Enviar o WOD pelo seletor de foto, com Tempo 12 min. Conferir fonte, formato/aviso, tres rounds e BMU em todos eles. Reanalisar e conferir versao anterior e nova estrategia.
5. Repetir com For Time e time cap explicitos. Confirmar estrategia por escada e ausencia de blocos agregados 45/45/30 como execucao.
6. Testar HYROX textual e uma foto HYROX genuina; conferir analise, estrategia, recarga, edicao e exclusao apenas de dados de teste.
7. Conferir calendario com resultado, tema, rolagem, teclado e orientacao do aparelho. Validar link de WhatsApp sem envio involuntario.
8. Conferir sessao, logout, erro de rede e tentativa repetida. Guardar prints, horario, commit e logs do Render, incluindo eventual 502/P2028.
9. Registrar aprovado/falhou/bloqueado em cada passo. Promocao para main exige aprovacao especifica e resolucao das pendencias criticas.
