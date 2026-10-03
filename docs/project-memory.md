# WOD Coach AI - memoria do projeto

Este arquivo registra aprendizados e decisoes do projeto para manter contexto entre mudancas.
Nao incluir senhas, chaves de API, URLs secretas de banco ou dados sensiveis.

## Regra de memoria

- Toda novidade relevante deve ser registrada neste arquivo no mesmo ciclo da implementacao.
- Documentar decisoes de produto, regras de IA, limites de uso, infraestrutura, deploy, banco de dados, integracoes e comportamentos importantes de UX.
- Nao registrar segredos, credenciais, tokens, URLs completas de banco, dados pessoais sensiveis ou conteudo privado dos usuarios.
- Quando uma mudanca tiver arquivo proprio de apoio, como guia de migracao ou skill, manter aqui um resumo curto e apontar o detalhe no arquivo dedicado.

## Produto

- O app e o WOD Coach AI, focado em CrossFit/WOD.
- URL de producao: https://wod-coach-ai.onrender.com
- O app roda no Render com Web Service Node e banco PostgreSQL.
- A experiencia principal deve ser simples no celular.
- O app tem tema claro/escuro.
- A navegacao principal usa icones e nao deve ficar poluida.
- O painel admin deve ficar escondido, sem aparecer no menu.

## Usuario admin

- A tela admin fica em `/admin`.
- O endpoint admin fica em `/api/admin/users`.
- O acesso admin e validado no backend pelo e-mail logado.
- Admin padrao atual: `celso.sabino1989@gmail.com`.
- Sem login, `/api/admin/users` deve responder 401.
- Com usuario nao admin, deve responder 403.
- O painel admin mostra usuarios, WODs, analises, estrategias, resultados e ultima atividade aproximada.

## IA e custos

- Analise de treino usa `gpt-5-mini`.
- Geracao de estrategia usa `gpt-5-mini`.
- A analise de treino tem `maxTokens: 2500`.
- A estrategia tem `maxTokens: 3500`.
- O app ainda nao grava uso exato de tokens por chamada.
- Um ajuste futuro util e registrar input tokens, output tokens, total tokens e custo estimado por usuario/WOD.
- Evitar chamadas desnecessarias a IA.
- Se houver imagem, a extracao do texto ocorre dentro da chamada de analise do WOD.

## Analise de WOD

- A analise nunca deve agrupar movimentos perdendo a estrutura original do treino.
- Se o treino diz "5 rounds", a analise precisa preservar os 5 rounds.
- Exemplo: `5 rounds / 16m lunge / 16 T2B / 8m HSW` nao deve virar apenas `80m / 80 reps / 40m` para a estrategia.
- Totais podem aparecer como resumo, mas a estrategia deve respeitar a ordem e o volume por round/bloco.
- Quando o WOD tem buy-in e buy-out, a estrategia precisa respeitar inicio e fim separadamente.
- Exemplo: `25 thrusters` no comeco e `25 thrusters` no final nao podem virar uma estrategia unica de 50 thrusters.

## Estrategia

- A estrategia deve ser objetiva e facil de ler no celular.
- Evitar texto longo e tecnico demais.
- A estrategia deve considerar:
  - formato do WOD;
  - rounds/blocos originais;
  - sequencia dos movimentos;
  - PRs e historico do atleta quando existirem;
  - estimulo do treino;
  - carga e capacidade conhecida.
- Exemplo de raciocinio desejado: se o treino tem 10 BMU por round e o atleta tem PR de 22 reps, a estrategia pode sugerir atacar mais esse movimento.
- Nao renderizar a secao visual de tecnica/warnings na estrategia por enquanto.

## HYROX

- A aba de esteira foi removida do app.
- HYROX tem area propria em `/hyrox`.
- HYROX segue o mesmo modelo de fluxo do CrossFit: enviar treino por texto/foto, listar historico, ver detalhe, analisar e gerar estrategia.
- Os treinos HYROX usam a mesma tabela base `wods`, separados por `discipline = HYROX`; WODs CrossFit usam `discipline = CROSSFIT`.
- A estrategia HYROX e separada da estrategia de CrossFit/WOD e persiste em `hyrox_strategies`.
- O usuario pode colar um treino estilo HYROX definido pelo box, nao apenas uma prova padrao.
- O `HyroxStrategyCoachAgent` usa IA para responder como executar o treino recebido: pacing, plano por blocos, quebras, transicoes, risco critico e final.
- A prova oficial HYROX continua sendo referencia de dominio: corrida + estacoes, preservar capacidade de correr/trabalhar no bloco seguinte, sled push/pull e wall balls como pontos comuns de quebra.

## Limites de IA

- O app nao aplica mais quota diaria por usuario para chamadas de IA.
- Analisar WOD, gerar estrategia de WOD, analisar HYROX e gerar estrategia de HYROX chamam a IA diretamente quando a OpenAI esta configurada.
- Para treinos nao padronizados, respeitar a ordem original do treino e nao forcar exatamente as 8 estacoes oficiais.

## Frontend

- Priorizar layout mobile.
- Evitar que textos quebrem de forma feia em chips/badges.
- Frases em badges devem ser curtas.
- A aba `+ Novo WOD` nao deve ativar tambem `Meus WODs`.
- O admin fica fora da barra de navegacao.
- O layout deve continuar limpo, escuro por padrao, com suporte ao tema claro.
- No painel inicial, ocultar `Sem check-in`, manter `Check-in ok` quando houver check-in e usar `Meus PR's` como acesso a `/personal-records`.
- O contador do painel inicial usa o texto `Wod's Realizados`.

## Deploy

- Fluxo atual: commit em `main` e `git push` para GitHub.
- O Render publica automaticamente apos o push.
- Apos deploy, validar:
  - `/health` responde `{ "status": "ok", "service": "wod-coach-ai-api" }`;
  - o HTML da rota alterada usa novo asset JS/CSS;
  - endpoints protegidos retornam 401 sem login.

## Integracoes futuras

- Apple Watch nao e acessivel diretamente por PWA/browser.
- Para Apple Watch/Apple Health, seria necessario app iOS ou wrapper com HealthKit.
- Garmin pode ser integrado via Garmin Health API, mas exige programa/aprovacao.
- Caminho mais simples para dados de wearable:
  - importacao manual de FIT/TCX/GPX/export;
  - depois integracao com Strava via OAuth;
  - por ultimo HealthKit/Garmin direto.
- Dados uteis para o coach: sono, HRV, FC repouso, carga recente, atividades, zonas de FC e recuperacao.
