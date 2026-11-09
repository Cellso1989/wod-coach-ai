# Navegacao e carregamento das telas

## Nova revisao: verificacao de sessao e Admin - 09/11/2026

A abertura autenticada aguardava `/auth/me` antes de antecipar os dados da
pagina. Essa rota fazia duas leituras consecutivas do mesmo usuario: uma
para validar o acesso e outra para montar a sessao/consultar o ultimo acesso.
O Admin repetia uma segunda consulta somente para verificar `isAdmin`.

- A autenticacao agora seleciona seis campos pequenos: id, nome, e-mail,
  status, permissao administrativa e horario do ultimo acesso. Senha e demais
  colunas do cadastro ficam fora dessa leitura.
- O resultado aprovado pertence somente a requisicao atual. `/auth/me` e a
  autorizacao do Admin usam essa leitura, removendo uma ida sequencial ao
  banco em cada um desses caminhos. Nao existe reaproveitamento entre
  requisicoes; bloqueio, exclusao e retirada da permissao administrativa sao
  conferidos novamente na proxima chamada.
- Resposta publica de sessao e `no-store` preservados, assim como o registro
  transacional de acesso e sua supressao durante 30 minutos. Quando um novo
  evento precisa ser registrado, essa gravacao ainda e aguardada.

Comparacao local do codigo anterior e ajustado usando a API real via
`app.inject`, banco simulado com atraso fixo de 100 ms por leitura, cinco
amostras por rota apos um aquecimento, usuario ficticio com acesso recente:

| Medida, mediana                  | Antes  | Depois | Reducao |
| -------------------------------- | -----: | -----: | ------: |
| Verificacao `/api/auth/me`        | 216 ms | 113 ms | 47,5%   |
| Leitura `/api/admin/access-logs`  | 218 ms | 106 ms | 51,3%   |
| Leituras do usuario por chamada  | 2      | 1      | 50%     |

O ensaio mede a eliminacao de uma espera de banco, sem rede real,
navegador, SQL ou gravacao de evento de retorno. As porcentagens nao sao
ganho do carregamento completo das telas nem medicao de producao. As
consultas de dados apos a sessao continuam dependendo da API/banco.
Evidencias locais em `output/session-loading/before.json`, `after.json` e
`benchmark*.log`; fixture/configuracao do ensaio no mesmo diretorio.

Regressoes protegem uma leitura por chamada, projecao sem credenciais,
resposta publica identica, concorrencia entre contas, alteracao de nome,
exclusao de conta e retirada da permissao administrativa. Regras de cache
das abas, isolamento, invalidacao e ranking fresco permanecem as descritas
abaixo. Sem mudanca de schema, infraestrutura ou IA. Verificacao final e
estado da publicacao registrados na memoria do projeto.

Publicado em 09/11/2026: develop `f765a81`, main `fbcc2ea`, Render
`dep-dbp3rth5efls73aokbeg` live as 18:42:51 de Sao Paulo. Verificacao
as 18:43:06: dez paginas/health 200, oito consultas protegidas 401 sem
sessao, 19 JS/CSS iguais ao build local de producao. Nenhum erro/aviso
na nova instancia entre 18:42:23 e 18:43:21, sem paginacao. 973 testes
gerais e 74 focados aprovados, 81 PostgreSQL opt-in pulados; build, tipos,
lint e formatacao aprovados. Sem sessao autenticada de producao ou
medicao do ganho real nas telas. Evidencia:
`output/deploy/session-loading-fbcc2ea-verified.json`.

## Primeira abertura e frontend - 09/11/2026

O usuario encerrou a frente de geracao de estrategia e pediu foco na demora
para abrir as telas e carregar suas informacoes. O cache de 03/11 ja acelerava
retornos, mas nao a primeira abertura. O frontend ainda baixava o codigo de
todas as paginas de uma vez e escondia o conteudo por uma introducao fixa de
1,35 s, com saida animada ate 1,8 s.

- Removida a introducao que bloqueava a abertura; o conteudo aparece assim que
  a sessao e os dados necessarios ficam disponiveis.
- Paginas secundarias agora usam importacao dinamica. O codigo da rota atual
  comeca a baixar em paralelo com a verificacao de sessao. Ao apontar, focar
  ou tocar em uma aba, antecipam-se seu codigo e apenas suas leituras elegiveis.
  Na entrada autenticada, a antecipacao de dados se limita ao destino atual;
  Inicio e check-in tambem participam. Nenhum carregamento de todas as abas.
- Enquanto um arquivo de pagina baixa, o menu permanece utilizavel. Falha no
  download oferece recarregamento e permite abrir outra aba.
- Listas, painel, perfil, ranking e Admin mostram estruturas de carregamento
  acessiveis, respeitando movimento reduzido. Check-in preserva o menu durante
  sua consulta. Formularios de perfil e controles administrativos continuam
  esperando seus dados antes de permitir edicao.
- CrossFit/HYROX/PRs cancelam o consumidor ao sair e permitem nova tentativa.
  Falha de leitura nao aparece como lista vazia; CrossFit nao mostra contagem
  zerada antes da resposta. PRs aguardam a leitura inicial antes de salvar.
- O feed do sino continua atualizando. Configuracao e assinatura push so sao
  consultadas ao abrir o painel, com carregamento/erro explicitos, reduzindo
  requisicoes secundarias na abertura de cada tela.

Mantidos os prazos e as regras de isolamento/invalidação abaixo: dados somente
em memoria por conta/dia, descarte antes/depois de escritas e ao retornar ao app,
sem cache novo de ranking, Admin, autenticacao ou detalhes de treino.
Nao houve mudanca de banco, hospedagem, modelos ou prompts.

### Medicao local

Build imediatamente anterior preservado antes das edicoes e build atual de
producao, Chromium isolado, 390 x 900 px, movimento normal, service worker
bloqueado, dados ficticios e atraso fixo de 500 ms por resposta de API.
Tres repeticoes alternadas por versao. Abertura direta de `/wods`, visita a
HYROX e retorno a CrossFit; tempos da abertura incluem verificacao de sessao.

| Medida                                  |     Antes |    Depois |
| --------------------------------------- | --------: | --------: |
| JavaScript inicial, sem compressao      | 349,84 KB | 242,68 KB |
| JavaScript inicial, gzip                | 104,45 KB |  76,81 KB |
| Menu visivel, mediana                   |  1.735 ms |  1.113 ms |
| Dados CrossFit visiveis, mediana        |  1.746 ms |  1.350 ms |
| Retorno recente a CrossFit, mediana     |     86 ms |     84 ms |
| Requisicoes de API na primeira abertura |         4 |         3 |

O arquivo JavaScript inicial ficou 30,6% menor (26,5% em gzip); arquivos das
paginas visitadas sao baixados separadamente. Nesta simulacao, o menu apareceu
35,9% antes e os dados, 22,7% antes. Retornos continuam na ordem de 0,1 s;
nao atribuir significado estatistico a pequenas diferencas com tres amostras.
As medidas nao representam latencia autenticada de producao. A consulta de
dados ainda depende da API/banco; a mudanca nao promete eliminar essa espera.

### Verificacao e estado

970 testes gerais passaram; 81 PostgreSQL opt-in ficaram pulados. Incluidas
duas regressoes de cancelamento das leituras HYROX/PRs sem interromper outro
consumidor. Build completo e typecheck passaram. Lint do frontend sem erros,
com o aviso preexistente de Fast Refresh sobre `cn` em `ui.tsx`.

Playwright CLI validou 24 verificacoes: celular/desktop, menu durante dados e
codigo pendentes, estados vazios/contagens, retry, retorno com cache, invalidacao
apos salvar, troca de conta sem dados antigos, push sob demanda, recuperacao
de falha de arquivo de pagina, ranking sempre na rede e check-in pendente.
A troca de conta tambem descarta notificacoes do menu de carregamento enquanto
o arquivo da pagina esta pendente.
Capturas 390/1280 px sem transbordamento horizontal; fluxo normal sem erros
de console. Evidencias locais em `output/screen-loading/report.json`,
`comparison-final.txt`, `verification*.txt` e `output/playwright/screen-loading-*.png`.

Usuario autorizou commit, push e deploy deste ajuste em 09/11/2026.
Publicado: develop `4fe3a01`, main `f327b2d`, Render
`dep-dboreenb9u1s73e05c30` live as 09:08:06 de Sao Paulo. Verificacao
publica as 09:08:45: health/paginas 200, seis leituras protegidas 401 sem
sessao, todos os 19 JS/CSS iguais ao build testado. Nenhum erro/aviso de
runtime no intervalo 09:08:06-09:08:46 consultado, sem paginacao. Login
conferido no navegador a 390 px; `auth/me` retorna 401 esperado sem sessao.
Sem medicao de latencia autenticada real nesta verificacao. Evidencia em
`output/deploy/screen-loading-f327b2d-verified.json`.

## Historico — navegacao entre abas em 03/11/2026

O usuario esclareceu que a lentidao ocorre ao trocar de abas. A otimizacao
anterior do detalhe CrossFit tratava outra parte do fluxo: ela reduziu o tamanho
da resposta de um treino, mas nao evitava repetir as leituras ao navegar.

## Diagnostico e ajuste

Cada montagem das paginas repetia suas consultas. O sino tambem buscava o feed
e a configuracao de push a cada nova instancia do menu. Perfil e Admin ainda
substituiam a pagina inteira por "Carregando...", impedindo outra navegacao
enquanto a consulta estava pendente.

- Leituras pequenas de listas CrossFit/HYROX, PRs, perfil, check-in e calendario
  sao compartilhadas e reaproveitadas por ate 15 segundos, apenas em memoria.
  Consultas com parametros diferentes permanecem separadas. Feed/status de push
  usam 10 segundos; a chave publica de push, 60 segundos.
- Ranking, Admin, autenticacao, detalhe/foto/analise/estrategia e historicos de
  versoes continuam na rede. O ranking permanece atualizado ao consultar.
- Ao apontar, focar ou tocar em um destino do menu, antecipa-se somente a leitura
  dessa aba. Nao se carregam todas as paginas na entrada.
- Salvamentos, exclusoes e geracoes descartam as leituras antes e depois da
  requisicao, inclusive em falhas. A consulta POST de status push e somente leitura.
  Respostas antigas nao voltam para o reaproveitamento depois de uma invalidacao.
- Logout, mudanca de conta, acesso negado e foco/retorno ao aplicativo descartam
  os dados. A chave de dia considera America/Sao_Paulo, evitando reutilizar o
  check-in de ontem. Sao no maximo 64 entradas, sem armazenamento persistente.
- Consumidores recebem copias independentes. Cancelar uma tela nao cancela a
  consulta compartilhada usada por outra; leituras compartilhadas tem limite
  de 30 segundos. Falhas nao sao guardadas e permitem nova tentativa.
- Leituras tardias de sessao nao podem restaurar uma conta anterior apos login
  ou logout. Erros de acesso de outra conta nao limpam a sessao atual.
  Quando a identidade muda, o conteudo protegido remonta para descartar tambem
  o estado visual/formularios da conta anterior durante a nova leitura.
- O efeito do sino depende do id do atleta, evitando reinicio ao atualizar o
  objeto da sessao. Perfil/Admin mantem o menu durante a espera; formularios
  ou controles administrativos so aparecem depois de receber seus dados.

Dados alterados em outro aparelho podem levar ate 15 segundos para aparecer
ao revisitar uma dessas listas sem retirar o foco do app. Voltar ao app ou
recarregar descarta esse reaproveitamento. Nao ha promessa de funcionamento offline.

## Comparacao controlada

Bundle anterior e build ajustado, navegador isolado de 390 px, dados ficticios,
500 ms de atraso por resposta de API, tres repeticoes por versao. Fluxo:
inicio, CrossFit, HYROX, PRs, Perfil e retorno pelas mesmas quatro abas.
Medicao do inicio do clique ate o dado da aba estar visivel. Mesmo navegador,
animacao inicial desabilitada pela preferencia de movimento reduzido e sem
service worker ou banco real. Nenhuma chamada de IA ou escrita em producao.

| Medida                            |  Antes | Depois |
| --------------------------------- | -----: | -----: |
| Primeira visita as abas, mediana  | 854 ms | 867 ms |
| Retorno as abas, mediana          | 856 ms |  78 ms |
| Requisicoes de API no fluxo       |     30 |     10 |
| Consultas do feed de notificacoes |      9 |      1 |
| Consultas da configuracao push    |      9 |      1 |

O ganho medido se concentra no retorno a dados recentes. A primeira visita
continua dependente da rede e do banco; o ensaio nao demonstrou melhora nela.
Reduzir consultas concorrentes pode ajudar a hospedagem real, mas isso nao foi
medido com uma sessao autenticada de producao.

Como referencia limitada, leituras publicas de producao neste ciclo levaram
233–388 ms para `/health` e 226–262 ms para `/api/auth/me` sem autenticacao (401).
Essas medidas nao incluem as consultas de dados/autorizacao de um atleta.
Nenhuma configuracao de hospedagem, regiao ou plano foi alterada.

Artefatos em `output/navigation-loading`: baseline em `before`,
`comparison.json`, logs de testes/build/tipos. Para repetir da raiz, preservar
um bundle anterior em `output/navigation-loading/before`, gerar o build atual
com `pnpm build` e executar `node scripts/benchmark-tab-navigation.mjs`.

## Verificacao

Testes cobrem concorrencia, cancelamento por consumidor, expiracao, clonagem,
falhas e retry, descarte de respostas atrasadas, logout/troca de conta, alteracoes
durante salvamento, POST de formulario, dia de Sao Paulo e rotas que devem ficar
sempre na rede. Navegador cobre retorno entre abas, salvamento, foco, sessao
antiga, menu durante leituras pendentes e regressao de ranking/detalhe CrossFit.

841 testes unitarios/API passaram; 70 PostgreSQL opt-in ficaram pulados sem
banco descartavel. Passaram 42 testes distintos de interface: 41 na suite ampla
e a verificacao adicional de troca de conta, com nova execucao dos oito testes
de navegacao. Build, typecheck, lint e formatacao passaram. O teste da mensagem
de geracao da estrategia agora espera a animacao inicial acabar antes de medir
seu indicador, evitando confundir dois elementos com role=status.

Sem migracao nova. Usuario autorizou commit, push e publicacao desta mudanca em 03/11/2026 pelo fluxo origin/main do Render.
