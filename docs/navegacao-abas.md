# Navegacao entre abas — 03/11/2026

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
