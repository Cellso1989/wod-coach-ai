import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  reviewBatch,
  reviewCapture,
  COACH_DIMENSIONS,
} from '../../scripts/review-wod-semantics.mjs';
import { simpleSourceCase, wodFormatCases } from '../fixtures/wod-format-cases.js';
import { MOCK_CONTEXT, MOCK_STRATEGY } from '../e2e/support/ai-mocks.js';

const corpus = JSON.parse(
  readFileSync(new URL('../../docs/auditoria-wod-corpus.json', import.meta.url), 'utf8'),
);
// Declared provider/reviewer metadata below is synthetic, solely to exercise the offline gates.
const capture = () => ({
  id: 'unit-capture',
  caseId: 'S1',
  origin: 'provider',
  sourceType: 'TEXT',
  source: simpleSourceCase.rawText,
  analysis: structuredClone(simpleSourceCase.analysis),
  strategy: structuredClone(MOCK_STRATEGY.strategy),
  athleteContext: MOCK_CONTEXT.context,
  athleteProfile: null,
  provenance: Object.fromEntries(
    ['analysis', 'strategy'].map((stage) => [
      stage,
      {
        model: 'unit-only',
        responseId: `synthetic-${stage}`,
        promptVersion: `sha256:${'a'.repeat(64)}`,
      },
    ]),
  ),
  coachReview: {
    reviewer: 'Synthetic test fixture, not a coach review',
    reviewedAt: '2026-10-05',
    approved: true,
    dimensions: Object.fromEntries(
      COACH_DIMENSIONS.map((dimension) => [
        dimension,
        { score: 2, note: 'Synthetic fixture, not an assessment.' },
      ]),
    ),
  },
});

describe('offline semantic review (all captures synthetic)', () => {
  it('keeps an empty corpus execution pending', () => {
    expect(reviewBatch({ schemaVersion: 1, captures: [] }, corpus)).toMatchObject({
      auditStatus: 'pending',
      pendingCases: corpus.map((item) => item.id),
    });
  });
  it('does not certify mocks even with filled human review fields', () => {
    expect(reviewCapture({ ...capture(), origin: 'mock' }, corpus[0]).status).toBe('pending');
  });
  it('checks a declared complete text capture without claiming it is an actual experiment', () => {
    expect(reviewCapture(capture(), corpus[0])).toMatchObject({
      status: 'passed',
      failures: [],
      pending: [],
    });
  });
  it.each(['reviewer', 'approved', 'dimensions'])('requires manual review field %s', (field) => {
    const input = capture();
    delete input.coachReview[field];
    expect(reviewCapture(input, corpus[0]).status).toBe('pending');
  });
  it.each([0, 1])('does not close a coaching dimension rated %s', (score) => {
    const input = capture();
    input.coachReview.dimensions.pacing.score = score;
    expect(reviewCapture(input, corpus[0]).status).toBe(score === 0 ? 'failed' : 'pending');
  });
  it.each(['format', 'duration', 'order', 'volume', 'source'])(
    'finds source divergence %s',
    (fault) => {
      const input = capture();
      if (fault === 'format') input.analysis.format = 'AMRAP';
      else if (fault === 'duration') input.analysis.durationMinutes = 12;
      else if (fault === 'order') input.analysis.movements.reverse();
      else if (fault === 'volume') input.analysis.movements[0]!.reps = 100;
      else input.source = 'different source';
      expect(reviewCapture(input, corpus[0]).status).toBe('failed');
    },
  );
  it('flags an invented time cap in the existing mixed-block persistence fixture', () => {
    const fixture = wodFormatCases.find((item) => item.name === 'mixed blocks and loads')!;
    const input = {
      ...capture(),
      caseId: 'S2',
      source: fixture.rawText,
      analysis: structuredClone(fixture.analysis),
    };
    expect(reviewCapture(input, corpus[1]).failures).toContain('Janela/time cap');
    input.analysis.durationMinutes = null;
    expect(reviewCapture(input, corpus[1]).status).toBe('passed');
    input.analysis.rounds![1]!.movements[0]!.loadDescription = '60kg';
    expect(reviewCapture(input, corpus[1]).status).toBe('failed');
  });
  it('requires two distinct transcribers and extracted text for image evidence', () => {
    const input = {
      ...capture(),
      sourceType: 'IMAGE',
      ocrReview: {
        imageHash: `sha256:${'b'.repeat(64)}`,
        transcribers: ['A', 'a'],
        transcription: simpleSourceCase.rawText,
        agreed: true,
      },
    };
    expect(reviewCapture(input, corpus[0]).status).toBe('pending');
    input.ocrReview.transcribers = ['A', 'B'];
    input.analysis.extractedText = simpleSourceCase.rawText;
    expect(reviewCapture(input, corpus[0]).status).toBe('passed');
    input.analysis.extractedText = 'For Time 100 Burpees';
    expect(reviewCapture(input, corpus[0]).status).toBe('failed');
  });
  it('does not close the full audit with one accepted text case or duplicate captures', () => {
    expect(reviewBatch({ schemaVersion: 1, captures: [capture()] }, corpus).auditStatus).toBe(
      'pending',
    );
    expect(
      reviewBatch({ schemaVersion: 1, captures: [capture(), capture()] }, corpus).auditStatus,
    ).toBe('failed');
  });
  it('rejects an invalid batch version', () => {
    expect(() => reviewBatch({ schemaVersion: 2, captures: [] }, corpus)).toThrow();
  });
});
