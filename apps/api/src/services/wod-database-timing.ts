/** Fixed labels only: never include SQL, parameters or athlete content in telemetry. */
export type WodDatabaseOperation =
  | 'sourceRead'
  | 'context.target'
  | 'context.history'
  | 'context.checkins'
  | 'context.personalRecords'
  | 'profile'
  | 'lease.claim'
  | 'lease.assert'
  | 'lease.release'
  | 'persistence.lock'
  | 'persistence.analysisVersion'
  | 'persistence.save'
  | 'persistence.versionRead'
  | 'persistence.versionCreate'
  | 'persistence.versionActivate';

// A Prisma operation can issue several SQL statements. This measures the entire
// application call, including pool/network waits, not database execution alone.
export type MeasureWodDatabase = <T>(
  operation: WodDatabaseOperation,
  work: () => Promise<T>,
) => Promise<T>;

export const withoutDatabaseTiming: MeasureWodDatabase = (_operation, work) => work();
