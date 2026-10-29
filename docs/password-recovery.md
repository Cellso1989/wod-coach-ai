# Recuperação de senha

O atleta pode solicitar um link em **Esqueci minha senha**, na tela de login.
O link expira em uma hora. A página pede a nova senha duas vezes e confirma
a alteração antes de oferecer o retorno ao login.

## Uso sem serviço de e-mail

Enquanto o envio não estiver configurado, um administrador pode abrir
**Admin → usuário → Recuperar senha**, copiar o link gerado e encaminhá-lo
diretamente ao titular da conta. O painel informa o e-mail da conta e a validade
do link. Nenhum e-mail é enviado por essa operação.

É necessário configurar somente `PASSWORD_RESET_BASE_URL` com a origem pública
do aplicativo, por exemplo `https://wod-coach-ai.onrender.com`. Não coloque a URL
de conexão do banco nesse campo.

O link dá acesso à troca da senha; deve ser entregue apenas ao titular da conta.
Ele fica na memória da tela enquanto o painel estiver aberto, sem persistência
em localStorage. Fechar o cartão remove o link da tela, mas não o revoga.
Não existe recuperação de senha de contas administrativas por esse endpoint.
Essas contas usam o fluxo por e-mail ou o procedimento operacional do proprietário.
A geração e o uso dos links não alteram aprovação, bloqueio ou privilégios da conta.

## Ativação do envio por e-mail

1. Cadastre uma conta no Resend e adicione um domínio de envio que você controla.
2. Configure no DNS os registros informados pelo Resend e aguarde a verificação.
3. Crie uma chave com permissão de envio e configure estes secrets no Render:
   - `RESEND_API_KEY`: chave de envio, apenas no servidor.
   - `PASSWORD_RESET_FROM`: por exemplo `WOD Coach AI <acesso@seu-dominio.com.br>`.
   - `PASSWORD_RESET_BASE_URL`: origem HTTPS do aplicativo.
4. Depois de publicar esta versão e ativar a configuração, solicite uma recuperação
   de uma conta de teste e confira o recebimento, inclusive fora da conta do remetente.
5. Complete a troca, entre com a senha nova e confira que o link usado não funciona novamente.

Não compartilhe chaves de API, connection strings ou senhas pelo chat ou pelo repositório.
O remetente de testes `onboarding@resend.dev` só atende o endereço da própria conta
do Resend; ele não habilita o envio aos atletas. Sem domínio verificado, use a
alternativa pelo painel Admin.

Referências oficiais: [verificação de domínio e limites do remetente de testes](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain),
[API de envio](https://resend.com/docs/api-reference/emails/send-email).

## Diagnóstico

Se faltar configuração, o pedido público retorna HTTP 503 para qualquer endereço,
com a orientação de pedir um link ao administrador. Nenhum token é criado nesse caso.
A API não informa se o endereço existe, nem devolve links ao público em produção.

Quando o serviço está configurado, a resposta pública é genérica para preservar
a privacidade das contas, inclusive se o provedor falhar. Os eventos do servidor
permitem investigar o envio sem incluir e-mail, senha, token ou corpo do provedor:

- `password_reset.unavailable`: falta configuração ou a origem do aplicativo é inválida.
- `password_reset.email_accepted`: o Resend aceitou o e-mail; inclui o ID da mensagem
  para consulta no provedor. Aceitação não confirma entrega na caixa de entrada.
- `password_reset.email_failed`: rejeição HTTP, falha de rede/timeout ou resposta
  inválida. O token dessa tentativa é invalidado. Verifique as credenciais,
  o remetente, a verificação do domínio e os limites no Resend.
- `password_reset.admin_link_created`: registra os IDs do administrador, da conta
  e do registro de recuperação, sem registrar o link.

O envio tem timeout de dez segundos. Não há reenvio automático; o usuário pode
solicitar outro link ou procurar o administrador. As rotas têm limites por IP.

## Segurança e testes

Os tokens são aleatórios (32 bytes), persistidos apenas como SHA-256 e válidos
por uma hora. A troca usa uma transação com bloqueio da conta e consumo condicional
do token. Duas tentativas simultâneas só permitem uma alteração, inclusive usando
links diferentes. Após uma troca, os demais links pendentes da conta são invalidados.
A senha é armazenada com bcrypt. Solicitar outro link não altera a senha atual.
As sessões já emitidas mantêm a política de sessão existente do aplicativo.

Em desenvolvimento explícito (`NODE_ENV=development`), se não houver configuração
de envio, a tela permite abrir um link local. Esse recurso não existe em produção
nem quando o ambiente não foi informado. A API nunca usa o header `Origin` do pedido
para construir links.

`tests/unit/password-reset.test.ts` verifica a configuração e o transporte sem
enviar mensagens reais. `tests/integration/password-reset-postgres.test.ts` verifica
o fluxo, permissões, validade, uso único, rollback e concorrência com PostgreSQL real.
Esta suíte só roda com `PASSWORD_RESET_TEST_DATABASE_URL` e `DATABASE_URL` apontando
para o mesmo banco descartável `password_reset_test` em `127.0.0.1`, com schema aplicado.
Use `pnpm --filter @wod-coach-ai/api test -- tests/integration/password-reset-postgres.test.ts`.
Nunca use o banco do aplicativo para esses testes.
