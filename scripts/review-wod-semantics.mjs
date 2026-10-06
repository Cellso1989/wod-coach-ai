import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import {
  wodAnalysisOutputSchema,
  strategyOutputSchema,
} from '../packages/validation/dist/index.js';
import { movementIdentity } from '../packages/coach-engine/dist/movement-identity.js';

export const COACH_DIMENSIONS = [
  'pacing',
  'breaks',
  'recovery',
  'scaling',
  'transitions',
  'target',
  'intensity',
  'context',
];
const normalized = (text) =>
  typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').toLowerCase() : '';
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

// This is an offline review aid, not a provider caller or an automatic coaching judge.
export function reviewCapture(capture, reference) {
  const failures = [];
  const pending = [];
  const compareMovements = (actual, expected, location) => {
    if (!actual || actual.length !== expected.length) {
      failures.push(`${location}: quantidade de movimentos`);
      return;
    }
    expected.forEach((item, index) => {
      const candidate = actual[index];
      if (movementIdentity(candidate.name) !== movementIdentity(item.name))
        failures.push(`${location}[${index}]: identidade/ordem`);
      for (const metric of ['reps', 'distanceMeters', 'calories']) {
        if ((candidate[metric] ?? null) !== (item[metric] ?? null))
          failures.push(`${location}[${index}]: ${metric}`);
      }
      if (
        item.loadDescription &&
        normalized(candidate.loadDescription) !== normalized(item.loadDescription)
      )
        failures.push(`${location}[${index}]: carga prescrita (conferir transcricao)`);
    });
  };
  if (!reference)
    return { id: capture?.id ?? null, status: 'failed', failures: ['Caso desconhecido'], pending };
  if (normalized(capture.source) !== normalized(reference.source))
    failures.push('Fonte diferente do corpus');
  const analysis = wodAnalysisOutputSchema.safeParse(capture.analysis);
  const strategy = strategyOutputSchema.safeParse(capture.strategy);
  if (!analysis.success) failures.push('Analise fora do schema');
  else {
    if (analysis.data.format !== reference.format) failures.push('Formato');
    if (analysis.data.durationMinutes !== reference.durationMinutes)
      failures.push('Janela/time cap');
    compareMovements(analysis.data.movements, reference.movements, 'Resumo');
    if (reference.blocks) {
      if (analysis.data.rounds?.length !== reference.blocks.length)
        failures.push('Quantidade de blocos');
      else
        reference.blocks.forEach((block, index) => {
          if (analysis.data.rounds[index].roundNumber !== index + 1)
            failures.push(`Bloco ${index}: numeracao`);
          compareMovements(analysis.data.rounds[index].movements, block, `Bloco ${index + 1}`);
        });
    } else if (analysis.data.rounds?.length) {
      compareMovements(
        analysis.data.rounds.flatMap((round) => round.movements),
        reference.movements,
        'Execucao',
      );
    }
  }
  if (!strategy.success) failures.push('Estrategia fora do schema');
  if (capture.origin !== 'provider') pending.push('Resposta real do provedor nao registrada');
  if (!nonempty(capture.id)) pending.push('Identificador da captura');
  for (const stage of ['analysis', 'strategy']) {
    const metadata = capture.provenance?.[stage];
    if (
      !nonempty(metadata?.model) ||
      !nonempty(metadata?.responseId) ||
      !/^sha256:[a-f0-9]{64}$/.test(metadata?.promptVersion ?? '')
    )
      pending.push(`Proveniencia ${stage}`);
  }
  if (!capture.athleteContext || !Object.hasOwn(capture, 'athleteProfile'))
    pending.push('Contexto/perfil utilizados');
  if (capture.sourceType === 'IMAGE') {
    const ocr = capture.ocrReview;
    if (
      !/^sha256:[a-f0-9]{64}$/.test(ocr?.imageHash ?? '') ||
      !Array.isArray(ocr?.transcribers) ||
      new Set(ocr.transcribers.filter(nonempty).map(normalized)).size < 2 ||
      ocr?.agreed !== true ||
      normalized(ocr?.transcription) !== normalized(reference.source)
    )
      pending.push('Gabarito OCR humano/imagem');
    if (!nonempty(analysis.data?.extractedText)) pending.push('Texto extraido da imagem');
    else if (normalized(analysis.data.extractedText) !== normalized(ocr?.transcription))
      failures.push('Transcricao OCR divergente (conferir com revisores)');
  } else if (capture.sourceType !== 'TEXT') pending.push('Tipo da fonte');
  const review = capture.coachReview;
  if (!nonempty(review?.reviewer) || !nonempty(review?.reviewedAt))
    pending.push('Revisao assinada pelo coach');
  for (const dimension of COACH_DIMENSIONS) {
    const assessment = review?.dimensions?.[dimension];
    if (![0, 1, 2].includes(assessment?.score) || !nonempty(assessment?.note))
      pending.push(`Revisao ${dimension}`);
    else if (assessment.score === 0) failures.push(`Coaching ${dimension}: inadequado`);
    else if (assessment.score === 1) pending.push(`Coaching ${dimension}: parcial`);
  }
  if (review?.approved !== true) pending.push('Aceite humano da fonte e do plano');
  return {
    id: capture.id ?? null,
    caseId: reference.id,
    sourceType: capture.sourceType,
    status: failures.length ? 'failed' : pending.length ? 'pending' : 'passed',
    failures,
    pending,
  };
}

export function reviewBatch(batch, corpus) {
  if (batch.schemaVersion !== 1 || !Array.isArray(batch.captures))
    throw new Error('Esperado schemaVersion 1 e captures array.');
  const captures = batch.captures.map((capture) =>
    reviewCapture(
      capture,
      corpus.find((item) => item.id === capture.caseId),
    ),
  );
  const pendingCases = corpus
    .filter((item) => {
      const accepted = captures.filter(
        (capture) => capture.caseId === item.id && capture.status === 'passed',
      );
      return (
        new Set(accepted.map((capture) => capture.id)).size < 3 ||
        (item.imageRequired && !accepted.some((capture) => capture.sourceType === 'IMAGE'))
      );
    })
    .map((item) => item.id);
  const uniqueIds = new Set(batch.captures.map((capture) => capture.id));
  const duplicateIds = uniqueIds.size !== batch.captures.length;
  return {
    auditStatus:
      captures.some((capture) => capture.status === 'failed') || duplicateIds
        ? 'failed'
        : pendingCases.length || captures.some((capture) => capture.status === 'pending')
          ? 'pending'
          : 'passed',
    duplicateIds,
    pendingCases,
    captures,
    note: 'Conferencia offline de registros declarados; nao comprova autenticidade, calibracao ou comportamento universal.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Uso: node scripts/review-wod-semantics.mjs <capturas.json>');
    const batch = JSON.parse(readFileSync(resolve(file), 'utf8'));
    const corpus = JSON.parse(
      readFileSync(new URL('../docs/auditoria-wod-corpus.json', import.meta.url), 'utf8'),
    );
    const report = reviewBatch(batch, corpus);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.auditStatus === 'passed' ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
