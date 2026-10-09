/**
 * Coach Engine: orchestrates WodAnalyzerAgent -> AthletePerformanceAgent
 * -> StrategyCoachAgent. Full pipeline implemented as of Fase 8.
 */
export * from './ai-json-agent.js';
export * from './wod-analyzer-agent.js';
export { reconcileTimeWarnings } from './wod-time-prescription.js';
export * from './wod-load-prescription.js';
export * from './wod-ladder-integrity.js';
export { readScoredIntervals, scoredIntervalAnalysisIssue } from './wod-interval-integrity.js';
export * from './athlete-performance-agent.js';
export * from './strategy-coach-agent.js';
export * from './hyrox-strategy-coach-agent.js';
