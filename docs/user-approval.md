# Aprovação de usuários

Novos cadastros começam como `PENDING`, sem cookie de sessão. Depois da aprovação,
o atleta faz login normalmente. `BLOCKED` impede login e qualquer requisição
protegida, mesmo com um token emitido antes do bloqueio. O bloqueio é verificado
no banco em cada requisição; operações que já estavam em andamento podem terminar.
Desbloquear uma conta permite novo login.

O campo `isAdmin` é independente do status de acesso. A interface usa o valor
fornecido pela API para mostrar a aba **Usuários** e proteger `/admin`. A API
confere novamente o administrador para listar usuários ou alterar seu acesso.
Campos enviados pelo cadastro não concedem privilégios.

## Migração

A migração `20261028190000_user_access_approval` deve ser aplicada junto da nova
versão da API. Ela mantém **todas as contas existentes como APPROVED**, muda o
padrão para `PENDING` e marca apenas a conta existente de
`celso.sabino1989@gmail.com` como administradora. A permissão fica vinculada ao ID
da conta, inclusive se o e-mail mudar depois. `ADMIN_EMAILS` deixa de conceder
permissões. Não é necessário configurar uma nova variável de ambiente.

Se houver mais de uma conta com esse e-mail após normalização, a migração falha
e desfaz suas alterações. Resolva a ambiguidade antes de tentar novamente.
Uma base vazia pode ser migrada normalmente e não recebe um administrador
automático por cadastro. Para inicializar uma base nova, o operador deve verificar
a identidade da conta criada e conceder `isAdmin = true` e
`accessStatus = 'APPROVED'` diretamente pelo ID correto no banco. Nenhuma rota
pública promove administradores. Não recrie a conta do proprietário para recuperar
acesso; preserve seu ID.

Geração e publicação seguem os comandos existentes:

```sh
pnpm db:generate
pnpm --filter @wod-coach-ai/database migrate:deploy
pnpm build
```

Evite manter uma instância da API antiga atendendo após a ativação da migração:
ela ainda não verifica status. Faça a troca da API de forma coordenada. Este
documento não autoriza publicação nem migração de produção.

## Histórico

Cada mudança grava o administrador (ID/e-mail), usuário afetado (ID/e-mail),
estado anterior, estado novo e horário. Atualização e histórico usam uma única
transação serializável. Repetir o mesmo estado não cria eventos duplicados;
conflitos concorrentes retornam 409 e pedem recarga. O painel mostra as últimas
50 alterações; as demais continuam no banco. Os e-mails são cópias do momento
da alteração para preservar a leitura do histórico.

O acesso do administrador não pode ser alterado pelo painel ou por essa API.
A aprovação de cadastro não substitui confirmação de e-mail; o WOD Coach mantém
a autenticação própria atual.

## Verificação

`tests/integration/user-access.test.ts` cobre cadastro pendente, campos forjados,
aprovação, bloqueio de sessão existente, autorização administrativa, proteção da
conta do administrador e registro das alterações. Os testes de outras rotas usam
principais explicitamente aprovados.

Para E2E que exigem usuários aprovados, configure `E2E_ADMIN_EMAIL` e
`E2E_ADMIN_PASSWORD` com uma conta administrativa do ambiente de testes. O helper
aprova os atletas novos pela própria API, sem exceções de autorização no produto.
