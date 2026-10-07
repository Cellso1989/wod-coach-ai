# Homologacao no Render

## Estado

Configuracao preparada localmente na develop. Nenhum recurso criado, commit,
push ou deploy realizado por este preparo. A URL so existira apos a criacao
na conta Render. Os arquivos render.yaml e render.supabase.yaml de producao
nao foram modificados.

## Separacao e custos

- Servico novo: wod-coach-ai-homolog, branch develop, sem dominio de producao.
- Banco exclusivo e contas ficticias. Nunca usar DATABASE_URL ou DIRECT_URL
  de producao: o comando de inicio aplica migrations ao banco configurado.
- Se producao usa Supabase, criar um projeto Supabase separado para preservar
  o mesmo tipo de conexao/pool no smoke. Confirmar o provedor efetivo no painel.
- Para Supabase, DATABASE_URL e a conexao de execucao com pool; DIRECT_URL e a
  conexao direta de migrations, ambas do projeto de homologacao.
- O Blueprint nao provisiona banco, evitando escolher um plano pago sem aprovacao.
- O servico usa Free como ponto inicial, espelhando o arquivo local de producao;
  conferir o plano realmente usado no painel antes de declarar equivalencia.
- Servicos Free compartilham cotas do workspace. Criar homologacao na mesma conta
  pode consumir horas, builds e banda tambem usados por producao. Conferir Billing
  e limites antes de criar; nao executar carga. Free nao significa ausencia de risco
  ou custo: chamadas OpenAI e e-mail tambem podem gerar cobranca.
- PostgreSQL Free do Render tem limite de uma instancia ativa por workspace e
  expira apos 30 dias. Nao excluir ou substituir um banco existente para abrir vaga.

## Passo a passo

1. Aprovar commit e push das correcoes e destes arquivos para develop. Nao fazer
   merge em main. Confirmar que o servico de producao acompanha main, nao develop.
2. Criar o banco/projeto de homologacao no provedor escolhido. Confirmar o
   identificador/host diferente do banco de producao antes de configurar migrations.
3. No Render, usar New > Blueprint e conectar o mesmo repositorio Git.
4. Escolher branch develop e Blueprint Path render.staging.yaml. Nao usar
   render.yaml ou render.supabase.yaml para este ambiente.
5. Preencher as variaveis solicitadas no painel, sem enviar segredos pelo chat:
   DATABASE_URL e DIRECT_URL do banco exclusivo, OPENAI_API_KEY preferencialmente
   de projeto de teste com limite de gastos, e configuracao de e-mail de teste.
   JWT_SECRET sera gerado, separado da sessao de producao.
6. PASSWORD_RESET_BASE_URL deve ser a URL HTTPS efetiva da homologacao. Se a URL
   ainda nao estiver confirmada, usar uma URL de homologacao prevista e corrigir
   antes de testar recuperacao de senha. Nunca usar a URL de producao.
7. Conferir a lista de recursos: apenas um novo servico wod-coach-ai-homolog,
   nenhum recurso de producao atualizado ou vinculado. Conferir plano e custos.
   So entao autorizar Deploy Blueprint.
8. Apos criar, desligar Auto Sync nas Settings do Blueprint. O arquivo ja desliga
   auto-deploy do servico, mas sincronizacao do Blueprint e uma configuracao
   separada que tambem pode iniciar alteracoes/deploys.
9. Abrir a URL onrender.com que o painel atribuiu. Confirmar /health retornando
   status ok, interface carregando e login de conta de teste. Health sozinho
   nao comprova conexao com banco: cadastrar e salvar um resultado tambem.
10. Conferir variaveis herdadas: nao adicionar grupo de segredos de producao;
    VITE_API_URL deve ficar ausente para usar API na mesma origem, nunca apontar
    para producao. Conferir OPENAI_MODEL, limites de IA/rate limit, versao Node,
    regiao e pool com o ambiente efetivo de producao.
11. Para atualizar depois de push autorizado em develop, usar Manual Deploy
    e confirmar o commit alvo. Alteracoes do Blueprint exigem Manual Sync.
12. Executar o roteiro de docs/qa-homologacao.md no ambiente e no iPhone fisico.
    Registrar URL, commit, horario, prints e logs sem credenciais. Promocao para
    producao exige aprovacao separada e resolucao das pendencias criticas.

## E-mail

Configurar remetente e credenciais de teste no painel para cobrir recuperacao
de senha. Caso indisponiveis, registrar esse fluxo como bloqueado, nao aprovado.
Usar apenas destinatarios de teste autorizados.

## Referencias

- [Criacao e sincronizacao de Blueprints](https://render.com/docs/infrastructure-as-code)
- [Campos do Blueprint](https://render.com/docs/blueprint-spec)
- [Limites do plano Free](https://render.com/docs/free)
