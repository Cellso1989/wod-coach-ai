# Abertura do treino CrossFit — 03/11/2026

O usuario confirmou que o "Carregando..." aparece ao abrir um treino.
O ajuste trata essa tela, sem alterar a autenticacao, geracao por IA ou HYROX.

## Alteracoes

- A pagina passa de tres requisicoes de leitura para uma:
  `GET /api/wods/:id?view=detail`. A resposta `detailVersion: 1` contem `wod`,
  `analysis` e `strategy`; null explicito significa que ainda nao foram gerados.
- O backend le as projecoes em transacao RepeatableRead, preservando um retrato
  consistente durante edicoes/reanalises concorrentes. A consulta filtra atleta
  e disciplina e ordena os movimentos. Nao carrega os bytes da imagem.
- A foto fica em `GET /api/wods/:id/image`, com a mesma autenticacao/aprovacao e
  verificacao de propriedade. Retorna os bytes originais e MIME permitido, com
  `Cache-Control: private, no-store`. Fonte e versoes arquivadas nao mudam.
- Havendo texto, a foto so e requisitada ao abrir "Ver foto do treino". Quando
  ela e a unica prescricao, aparece automaticamente. Estrategia e texto podem
  aparecer antes do download da foto.
- O GET original sem `view=detail` mantem seu contrato completo. O cliente tem
  compatibilidade com servidor anterior durante publicacao/rollback: somente
  respostas sem `detailVersion` usam as duas leituras antigas adicionais.
- Erro HTTP, contrato moderno incompleto e cancelamento nao viram ausencia de
  analise/estrategia. Bloqueios de mutacao e protecao contra respostas atrasadas
  permanecem. Na compatibilidade, texto pode ser lido enquanto as outras respostas
  chegam, mas os controles de mutacao continuam aguardando.

## Comparacao no navegador

Comparado o bundle publicado do commit `c1f8169` com o build local ajustado.
Navegador isolado de 390 px, dados ficticios e foto JPEG sintetica de 2.365.704
bytes. A medicao comeca no clique para abrir o treino a partir do painel, depois
da entrada no app. Nenhuma conta, treino real, banco ou chamada de IA e utilizado.

Rede controlada: 100 ms por resposta mais 600 KiB/s de JSON comprimido com Brotli
(quality 4). Cada versao teve tres repeticoes. Criterio: analise, estrategia e
botao de reanalise disponiveis, nao apenas sumico do texto "Carregando...".

| Versao   | Tempos ate utilizavel   | Mediana | Requisicoes iniciais do treino |
| -------- | ----------------------- | ------- | ------------------------------ |
| Anterior | 5,09 / 4,65 / 4,82 s    | 4,82 s  | 3                              |
| Ajustada | 0,466 / 0,480 / 0,456 s | 0,466 s | 1                              |

No fixture, o JSON inicial passou de 3.155.608 para 1.337 bytes; o volume
comprimido simulado, de 2.357.462 para 696 bytes. A foto e transferida quando
solicitada, preservando o conteudo. Os tamanhos de dados reais variam.

Essa e uma comparacao controlada do carregamento no navegador, nao medicao de
producao, latencia do banco real ou promessa de ganho para todos os treinos.
Treinos somente em texto tendem a ter ganho menor; inicializacao da hospedagem
e verificacao da sessao continuam contribuindo para o tempo total.

Artefatos locais em `output/page-loading`: `comparison.json`, `compare.ts`,
`before-pending.png`, `after-ready.png` e `after-photo.png`. As capturas foram
inspecionadas, incluindo foto expandida e estrategia visivel.

## Verificacao

- 803 testes unitarios/API passaram; 70 PostgreSQL opt-in nao executados, pois
  Docker esta indisponivel. Novas verificacoes cobrem contrato, permissao,
  snapshot, bytes/MIME, falhas, compatibilidade e cancelamento.
- Comparacao automatizada do navegador confirmou uma requisicao inicial e
  nenhuma foto ate expandir; apos expandir, uma requisicao de foto com sucesso.
- Build, typecheck e lint passaram; aviso anterior de Fast Refresh permanece.
- 25 testes de interface passaram, cobrindo abertura, respostas atrasadas,
  edicao, reanalise, conflitos de geracao e historico de versoes.
- Testes antigos de interface ainda exigiam o bloco Ritmo removido na mudanca
  anterior. Falha de resposta atrasada reproduzida tambem no bundle ja publicado
  (mesmo seletor). Os marcadores de estado desses testes foram transferidos para
  Descanso, que permanece visivel, preservando as verificacoes de isolamento,
  bloqueio e retry, sem recolocar o bloco removido na interface.

Sem migration nova. Usuario autorizou commit, push e deploy em 03/11/2026.
Publicacao segue pelo fluxo origin/main do Render; confirmacao do deploy e
checagens de disponibilidade ficam nos artefatos locais de output/deploy.
