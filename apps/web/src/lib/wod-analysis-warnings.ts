const FORMATS: Record<string, string> = {
  ROUNDS_FOR_TIME: 'voltas para completar no menor tempo possivel',
  FOR_TIME: 'treino para completar no menor tempo possivel',
  AMRAP: 'o maximo de voltas ou repeticoes dentro do tempo definido',
  EMOM: 'exercicios a cada minuto',
  E2MOM: 'exercicios a cada dois minutos',
  CHIPPER: 'sequencia em que um exercicio e concluido antes do proximo',
  STRENGTH: 'treino de forca',
  INTERVAL: 'treino com intervalos de trabalho e descanso',
};

function readableTerms(text: string): string {
  return text
    .replace(
      /\b(?:ROUNDS_FOR_TIME|FOR_TIME|AMRAP|E2MOM|EMOM|CHIPPER|STRENGTH|INTERVAL)\b/g,
      (term) => FORMATS[term]!,
    )
    .replace(/\btime[ -]?cap\b/gi, 'tempo limite')
    .replace(/\btarget\b/gi, 'meta de tempo')
    .replace(/\brounds?\b/gi, 'voltas');
}

// Legacy warnings remain intact in storage; only the athlete-facing copy changes.
export function formatWodAnalysisWarnings(warnings: string[]): string[] {
  return [
    ...new Set(
      warnings
        .map((warning) => {
          const text = warning.trim();
          if (/^Time cap nao informado; Target e uma meta/.test(text))
            return 'Falta informar o tempo limite para terminar. A meta de tempo nao substitui esse limite.';
          if (/^Tempo ou time cap nao informado/.test(text))
            return 'Falta informar o tempo do treino ou o tempo limite para terminar. A analise continua sem essa informacao.';
          const missingPortugueseLoad = text.match(
            /^Carga nao informada para (.+?); confirme antes de executar\.$/,
          );
          if (missingPortugueseLoad)
            return `Falta informar a carga de ${missingPortugueseLoad[1]}. Preencha em Editar cargas.`;
          const missingLoad =
            text.match(
              /^(?:load|loads|weight|weights)\s+(?:not specified|not provided|not informed|missing|unspecified)(?:\s+for\s+(.+?))?[.!]?$/i,
            ) ?? text.match(/^missing\s+(?:load|weight)(?:\s+for\s+(.+?))?[.!]?$/i);
          if (missingLoad)
            return missingLoad[1]
              ? `Falta informar a carga de ${missingLoad[1].replace(/[.!]$/, '')}. Preencha em Editar cargas.`
              : 'Falta informar a carga dos exercicios com peso. Preencha em Editar cargas.';
          const inferred = text.match(
            /\b(?:format assumed|assumed format|format inferred|formato (?:presumido|assumido))\s*(?:as\s+|como\s+)?([A-Z_0-9]+)/i,
          );
          if (inferred && FORMATS[inferred[1]!.toUpperCase()]) {
            const rounds = text.match(/(?:['"]|\b)(\d+)\s+rounds?\b/i);
            return rounds && inferred[1]!.toUpperCase() === 'ROUNDS_FOR_TIME'
              ? `Entendi o treino como ${rounds[1]} voltas para terminar no menor tempo possivel. Confirme se esse e o formato correto.`
              : `Entendi o formato como ${FORMATS[inferred[1]!.toUpperCase()]}. Confirme se essa leitura esta correta.`;
          }
          if (
            /^(?:time(?:[ -]?cap)?|duration)\s+(?:not specified|not provided|missing|unspecified)/i.test(
              text,
            )
          ) {
            return 'Falta informar o tempo do treino ou o tempo limite para terminar. A analise continua sem essa informacao.';
          }
          if (/^(?:target|goal)\s+(?:not specified|not provided|missing|unspecified)/i.test(text)) {
            return 'A meta de tempo nao foi informada. Ela e diferente do tempo limite para terminar.';
          }
          if (/^(?:unable to|could not|cannot)\s+(?:read|identify|confirm)/i.test(text)) {
            return 'Nao consegui confirmar uma parte do treino. Confira se a foto esta legivel ou complete o texto.';
          }
          // Do not invent a translation for an unfamiliar English warning or hide the uncertainty.
          if (
            /\b(?:not specified|not provided|based on|assumed|inferred|unclear|ambiguous|could not|unable to|must be|should be|was not|were not)\b/i.test(
              text,
            )
          ) {
            return 'Ha uma observacao da analise que precisa ser conferida. Revise a foto ou o texto antes de gerar a estrategia.';
          }
          return readableTerms(text);
        })
        .filter(Boolean),
    ),
  ];
}
