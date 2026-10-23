# Notificações de resultados do ranking

Ao registrar o primeiro resultado de um WOD de CrossFit, um participante do ranking
gera o aviso **“Fulano registrou um resultado 👀”** para os demais participantes.
O próprio autor não recebe o aviso. Edições, check-ins e resultados de HYROX não geram
avisos. Não é necessário que o resultado já tenha um adversário comparável no ranking.

Os avisos não contêm tempo, score, reps, carga, detalhes do treino nem link para o WOD
privado. O toque abre `/ranking`. A interface consulta os avisos a cada 30 segundos,
ao voltar à aba e depois de alterar a participação no ranking. Mostra os 50 mais recentes.

Sair do ranking remove os avisos recebidos, os avisos sobre o atleta e suas inscrições
push. Voltar ao ranking não publica resultados antigos. Push exige ativação explícita
em cada dispositivo. Sair da conta também cancela a inscrição daquele dispositivo.

## Configuração no servidor

1. Aplicar as migrations com `pnpm --filter @wod-coach-ai/database migrate:deploy`.
2. Gerar um par de chaves com
   `pnpm --filter @wod-coach-ai/api exec web-push generate-vapid-keys`.
3. Configurar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no servidor.
   O subject deve ser um contato válido `mailto:` ou URL HTTPS. Manter as mesmas chaves
   nos próximos deploys. Nunca colocar a chave privada em variáveis `VITE_*`.
4. Servir o app por HTTPS, abrir o sininho e ativar os avisos no dispositivo.

Sem chaves, o histórico dentro do app funciona normalmente; a opção de ativar push
fica indisponível. A produção serve app e API na mesma origem; o service worker usa
essa origem para confirmar a sessão antes de exibir o aviso.
No iPhone/iPad, usar iOS/iPadOS 16.4 ou posterior e adicionar o app à tela inicial.

## Entrega

A gravação do resultado, histórico e fila push ocorre na mesma transação.
O envio externo é separado, com fila persistente no PostgreSQL. O processo da API
consulta a fila a cada 15 segundos, reserva cada entrega por 60 segundos e tenta até
cinco vezes com espera crescente. Não exige Redis ou serviço adicional. Inscrições
expiradas (404/410) são removidas. Avisos com mais de 24 horas não são enviados.
Uma resposta ambígua do provedor pode causar reenvio; a tag da notificação reduz
duplicações visuais no dispositivo.

A participação do autor e destinatário é verificada novamente no envio e na leitura.
Antes de mostrar um push, o service worker confirma que o aviso pertence à conta
atualmente autenticada. Sem sessão válida ou sem conseguir consultar a API, ele
descarta o aviso. O histórico permanece acessível ao abrir o app.

## Validação manual em dispositivo real

Com duas contas participantes e uma terceira fora do ranking:

- Ativar push na segunda conta e fechar o app.
- Registrar resultado na primeira: somente a segunda deve receber o aviso.
- Confirmar a frase sem pontuação e o toque abrindo o ranking.
- Editar o resultado: nenhum novo aviso.
- Desativar push, sair da conta ou sair do ranking: nenhum novo push nesse dispositivo.
- Negar a permissão: o histórico no app deve continuar funcionando.

Os testes automatizados verificam seleção de destinatários, privacidade do contrato,
autenticação, repetição, fila e comportamento do service worker; a entrega via
APNs/FCM precisa dessa conferência em dispositivo real com as chaves configuradas.
