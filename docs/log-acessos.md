# Log de acessos

O Admin mostra o último acesso registrado em cada usuário e um histórico separado
das aprovações/bloqueios, com filtro por usuário, atualização manual e páginas de
50 eventos. Datas aparecem em `America/Sao_Paulo`, independentemente do fuso do
aparelho do administrador. A API exige sessão aprovada e `isAdmin`, e responde
com `Cache-Control: no-store`; estas consultas continuam fora do cache de abas.

## O que é registrado

- `LOGIN`: cada login com credenciais corretas e acesso aprovado.
- `SESSION_RETURN`: consulta autenticada a `/auth/me` ao abrir/recarregar o app
  ou voltar a uma aba visível com a sessão salva. Registra no máximo um retorno
  a cada 30 minutos por usuário, considerando também o último login.
- `CROSSFIT_ANALYSIS` / `HYROX_ANALYSIS`: análise por IA concluída e salva com
  sucesso, apresentada como “Analisou treino CrossFit” ou “Analisou treino HYROX”.
  Cada análise/reanálise concluída cria um evento, sem intervalo de 30 minutos.
  Leituras de análises antigas e edições manuais de tempo/carga não contam.
  Falhas da IA, gravações rejeitadas e conflitos CrossFit não criam sucesso.

O intervalo é compartilhado entre aparelhos e abas da mesma conta. Navegar entre
telas e chamadas normais da API não criam eventos. Não há heartbeat: o histórico
não comprova presença online, duração da sessão nem todas as ações realizadas.
`lastAccessAt` indica o último login/retorno registrado, e não cada consulta suprimida
pelo intervalo. O botão de atualização atualiza o histórico; recarregar o painel
também atualiza os horários na lista de usuários.

Os eventos de análise aparecem no mesmo histórico filtrável, mas não são
atribuídos artificialmente a um login específico. Sua ausência não comprova que
o usuário nunca analisou um treino. O início da coleta e possíveis falhas de
gravação também afetam o histórico disponível. Análises não atualizam
`lastAccessAt` nem interferem na janela dos retornos de sessão.

Os eventos guardam somente ID do usuário, tipo e horário. Nome/e-mail são lidos
do cadastro atual na consulta do admin. Não são guardados senhas, tokens, IP,
localização, user-agent ou conteúdo dos treinos. Contas sem eventos mostram
“Sem registro”; não se inventa nem recupera histórico anterior à ativação.

O registro verifica novamente `APPROVED` e usa uma atualização condicional da
linha do usuário dentro da mesma transação da inserção. Isso protege a janela de
30 minutos inclusive com leituras simultâneas ou mais de uma instância da API.
Falhas revertem também `lastAccessAt`, permitem tentativa posterior e geram o
evento técnico `user_access_log.failed`, sem impedir login/restauração de sessão.
Não há garantia de registrar acessos durante indisponibilidade do armazenamento.

O evento de análise é inserido após o caminho de persistência concluir, fora
da transação da análise. Uma falha no log gera `workout_analysis_log.failed` sem
transformar uma análise já salva em erro nem repetir a chamada de IA. Há uma
janela entre salvar e registrar na qual uma interrupção pode perder o evento.
Nenhum ID, nome ou conteúdo de treino é copiado para o log administrativo.

## Migração e publicação

Aplicar `20261105190000_user_access_logs` antes de iniciar a nova API e gerar o
cliente Prisma. A migração adiciona `users.lastAccessAt` nullable, enum
`UserAccessKind` e tabela `user_access_logs`, com índices globais e por usuário
para ordenar/paginar por horário e ID. Não modifica aprovação, privilégios,
credenciais, treinos ou resultados existentes. Excluir explicitamente a conta
remove seus eventos por cascata. Não há expiração automática dos eventos.

Os dois valores de análise foram incluídos na mesma migração ainda não aplicada
deste recurso, antes de seu primeiro commit/publicação.

A validação local deste ciclo usou somente base descartável, sem aplicar a
migração no banco da aplicação. O usuário autorizou commit, push e publicação
em 05/11/2026. O Render executa `migrate:deploy` antes de iniciar a nova API;
a liberação deve ser conferida pelo commit, status do deploy e bundle servido.

## Validação

Regressões em `tests/integration/user-access.test.ts` cobrem autorização,
credenciais e estados negados, logins repetidos, sessão salva e limite exato de
30 minutos, leituras antigas/concorrentes, isolamento por conta, rollback e
continuidade do login em falha de armazenamento, validação de filtros, projeção
sem segredos e consulta paginada. A interface foi conferida com dados fictícios
em 320/390/1280 px, incluindo filtro, paginação, estado vazio, atualização,
erro/retry, repetição do mesmo filtro e descarte de resposta atrasada depois de
trocar o filtro. Selecionar novamente o filtro atual preserva a lista carregada.

A suíte geral passou com 888 testes (70 opt-in pulados), incluindo 11 novas
regressões de eventos de análise em `tests/integration/wod-reanalysis.test.ts`:
análise/reanálise CrossFit e HYROX, leitura sem evento, falha da IA/persistência,
conflito, rollback tardio, edição manual e falha do log sem repetir a IA nem
invalidar o sucesso salvo. Build, typecheck, lint e formatação aprovados; lint
mantém o aviso preexistente em `ui.tsx`.

Todas as migrações foram aplicadas em PostgreSQL embarcado (PGlite), com
verificação de dados legados, valores nulos, ausência de histórico inventado,
atualização condicional, rollback, chave estrangeira e exclusão por cascata.
Esse ensaio não comprova concorrência real entre conexões Prisma/PostgreSQL.
O Docker estava indisponível; testes PostgreSQL opt-in não foram executados.
