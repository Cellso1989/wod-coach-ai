# Ficha de Revisao Humana

Status: pendente. Nenhuma avaliacao de coach ou OCR real registrada nesta rodada.

Para cada captura: ID do caso S1-S8, ID unico da captura, data, commit, fonte
literal ou hash da imagem, modelo/prompt/responseId de analise e estrategia,
perfil/contexto exato utilizado, resposta bruta, validada, retry e tokens.
Nao incluir nomes do atleta, contatos ou chaves. Revisor deve concordar com o
gabarito ou registrar a divergencia antes do aceite. Exemplos simulados sao mocks.

| Dimensao (`dimensions`) | Nota 0/1/2 | Motivo e trecho da resposta |
| --- | --- | --- |
| Pacing (`pacing`) | Pendente | |
| Quebras (`breaks`) | Pendente | |
| Recuperacao (`recovery`) | Pendente | |
| Escala (`scaling`) | Pendente | |
| Transicoes (`transitions`) | Pendente | |
| Alvo (`target`) | Pendente | |
| Intensidade (`intensity`) | Pendente | |
| Uso do contexto e incertezas (`context`) | Pendente | |

0 = inadequado; 1 = parcial, requer revisao; 2 = adequado para este caso.
Coach (`reviewer`): pendente. Data (`reviewedAt`): pendente.
Aceite da interpretacao da fonte e do plano (`approved`): pendente.
Nao preencher automaticamente nem atribuir revisao humana ao assistente.

Para imagem: hash SHA-256, dois revisores distintos (`transcribers`), transcricao
humana literal (`transcription`) e concordancia (`agreed`). Trechos ilegíveis
exigem registro separado de ambiguidade/rejeicao, nao completar um gabarito
inventado. O runner cobre fontes legiveis com gabarito; rejeicao de imagem
ilegivel continua caso manual separado, nao se transforma em coaching aprovado.

## Conferencia Offline

`pnpm build` prepara os schemas e identidade usados pelo runner.
`node scripts/review-wod-semantics.mjs docs/auditoria-wod-capturas.json`
nao chama IA, nao acessa banco nem grava resultados. Exit 0 = conjunto declarado
completo; 2 = pendente/falha semantica; 1 = entrada invalida/erro de execucao.
Capturas vazias e mocks nunca encerram a auditoria.

O arquivo de entrada tem `schemaVersion: 1` e `captures: []`. Cada captura exige
`id`, `caseId`, `origin` (`provider` ou `mock`), `sourceType` (`TEXT` ou `IMAGE`),
`source` (gabarito literal do corpus), `analysis`, `strategy`, `athleteContext`,
`athleteProfile` (pode ser null), `provenance.analysis` e `provenance.strategy`
(cada uma com `model`, `responseId`, `promptVersion`), e `coachReview` com
`reviewer`, `reviewedAt`, `approved`, `dimensions`. Cada dimensao tem `score`
e `note`. Imagens precisam tambem de `ocrReview` com os campos acima.

O runner confere schema, formato, janela, ordem, volumes e blocos/cargas exatas.
Variantes textuais semanticamente equivalentes de carga podem ser sinalizadas
para revisao; nao silenciar divergencia apenas para obter exit 0. Fonte/perfil
e pesos/descansos nao cobertos mecanicamente exigem o aceite humano assinado.
O runner nao recalcula coaching nem substitui os validadores da geracao.
Metadados declarados nao sao prova criptografica de uma chamada real.

Para completar o conjunto: tres capturas distintas aceitas por caso e pelo
menos uma captura IMAGE em S1, S2 e S3. Esse minimo e criterio desta amostra,
nao certificacao estatistica. Imagens consentidas, teto de custo e revisor
continuam necessarios antes de executar a avaliacao real.
