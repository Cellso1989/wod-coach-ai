// Em produção o frontend é servido pela própria API (mesma origem), então
// o padrão é string vazia (caminho relativo). Em dev, aponta pro Fastify
// rodando em outra porta via VITE_API_URL.
const API_URL = import.meta.env.VITE_API_URL ?? '';

export interface WodVersion {
  id: string;
  version: number;
  createdAt: string;
  reason?: string;
  analysisVersionId?: string | null;
  sourceSnapshot: Record<string, unknown>;
  inputSnapshot?: unknown;
  snapshot: Record<string, unknown>;
}

export interface WodVersions {
  analysisVersions: WodVersion[];
  strategyVersions: WodVersion[];
  nextAnalysisBefore: number | null;
  nextStrategyBefore: number | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error ?? 'Erro inesperado');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error ?? 'Erro inesperado');
  }

  return response.json() as Promise<T>;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface DailyCheckin {
  id: string;
  date: string;
  timeSeconds: number | null;
  rounds: number | null;
  reps: number | null;
  weightKg: number | null;
  notes: string | null;
}

export interface DailyCheckinInput {
  timeSeconds?: number;
  rounds?: number;
  reps?: number;
  weightKg?: number;
  notes?: string;
}

export type WodSourceType = 'TEXT' | 'IMAGE' | 'TEXT_AND_IMAGE';

export interface WodResult {
  id: string;
  score: string;
  timeSeconds: number | null;
  rounds: number | null;
  reps: number | null;
  load: number | null;
  distance: number | null;
}

export interface WodResultInput {
  score: string;
  timeSeconds?: number;
  rounds?: number;
  reps?: number;
  load?: number;
  distance?: number;
}

export interface Wod {
  id: string;
  userId: string;
  date: string;
  sourceType: WodSourceType;
  discipline?: 'CROSSFIT' | 'HYROX';
  rawText: string | null;
  imageMimeType: string | null;
  imageData?: string | null;
  name: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  result?: WodResult | { score: string } | null;
}

export interface WodSubmissionInput {
  rawText?: string;
  name?: string;
  notes?: string;
  image?: File;
}

export type WodFormat =
  'AMRAP' | 'FOR_TIME' | 'EMOM' | 'E2MOM' | 'CHIPPER' | 'ROUNDS_FOR_TIME' | 'STRENGTH' | 'INTERVAL';

export type MovementCategory =
  'gymnastics' | 'weightlifting' | 'conditioning' | 'monostructural' | 'mixed_modal';

export interface WodMovementResult {
  id: string;
  order: number;
  name: string;
  category: MovementCategory;
  reps: number | null;
  distanceMeters: number | null;
  loadDescription: string | null;
  calories: number | null;
}

export interface WodRoundMovement {
  name: string;
  category: MovementCategory;
  reps: number | null;
  distanceMeters: number | null;
  loadDescription: string | null;
  calories: number | null;
}

export interface WodRound {
  roundNumber: number;
  label?: string | null;
  movements: WodRoundMovement[];
}

export interface WodAnalysis {
  rawResponse?: { targetMinutes?: number | null } | null;
  versionId?: string | null;
  id: string;
  wodId: string;
  format: WodFormat | null;
  durationMinutes: number | null;
  stimulus: string | null;
  estimatedIntensity: number | null;
  engineDemand: number | null;
  gripDemand: number | null;
  legDemand: number | null;
  gymnasticsDemand: number | null;
  technicalDemand: number | null;
  confidence: number;
  warnings: string[];
  movements: WodMovementResult[];
  roundBreakdown: WodRound[] | null;
}

export interface PersonalRecord {
  id: string;
  movementName: string;
  value: number;
  unit: string;
  recordType?: import('@wod-coach-ai/types').PersonalRecordType;
  repetitions?: number | null;
  achievedAt: string;
  notes: string | null;
}

export interface PersonalRecordInput {
  movementName: string;
  value: number;
  unit: string;
  recordType?: import('@wod-coach-ai/types').PersonalRecordType;
  repetitions?: number | null;
  achievedAt?: string;
  notes?: string;
}

export interface TrainingLoadWindow {
  days: number;
  sessionCount: number;
}

export type DataSufficiency = 'low' | 'moderate' | 'high';

export interface SimilarWodMatch {
  wodId: string;
  date: string;
  similarityScore: number;
  result: { score: string } | null;
  previousStrategy: {
    recommendedIntensity: number;
    targetRpe: number;
    criticalPoint: string | null;
    breakStrategy: Array<{ movement: string; strategy: string }>;
  } | null;
}

export interface AthleteContext {
  trainingLoad: {
    last7Days: TrainingLoadWindow;
    last14Days: TrainingLoadWindow;
    last28Days: TrainingLoadWindow;
  };
  similarWods: SimilarWodMatch[];
  relevantPersonalRecords: Array<{
    movementName: string;
    value: number;
    unit: string;
    recordType?: import('@wod-coach-ai/types').PersonalRecordType;
    repetitions?: number | null;
    achievedAt: string;
  }>;
  dataSufficiency: DataSufficiency;
}

export interface StrategyMovementNote {
  movement: string;
  strategy: string;
}

export interface WodStrategy {
  versionId?: string | null;
  id: string;
  wodId: string;
  recommendedIntensity: number;
  targetRpe: number;
  loadRecommendation: string | null;
  pacing: string;
  breakStrategy: StrategyMovementNote[];
  restStrategy: string;
  movementStrategy: StrategyMovementNote[];
  transitionStrategy: string;
  energyManagement: string;
  goal: string;
  target: string | null;
  criticalPoint: string | null;
  confidence: number;
  warnings: string[];
}

export type HyroxDivision =
  'OPEN_MEN' | 'OPEN_WOMEN' | 'PRO_MEN' | 'PRO_WOMEN' | 'DOUBLES' | 'RELAY';

export type HyroxExperience = 'first_timer' | 'returning' | 'competitive';

export interface HyroxStrategyInput {
  rawWorkout: string;
  division: HyroxDivision;
  experience: HyroxExperience;
  targetTimeMinutes?: number | null;
  runPaceSecondsPerKm?: number | null;
  strengths?: string[];
  limiters?: string[];
  injuryNotes?: string | null;
  goal?: string | null;
}

export interface HyroxBlockPlan {
  block: string;
  focus: string;
  execution: string;
}

export interface HyroxBreakStrategy {
  movement: string;
  strategy: string;
}

export interface HyroxStrategy {
  id?: string;
  wodId?: string;
  workoutSummary: string;
  target: string | null;
  runPace: string | null;
  pacing: string;
  blockPlan: HyroxBlockPlan[];
  breakStrategy: HyroxBreakStrategy[];
  transitionStrategy: string;
  criticalRisk: string;
  finalPush: string;
  warnings: string[];
  confidence: number;
  createdAt?: string;
  updatedAt?: string;
}

export type HyroxWorkout = Wod;

export interface TrainingFrequencyWeek {
  weekStart: string;
  wodCount: number;
}

export interface TrainingCalendarEntry {
  completedAt: string;
  wodId: string;
  name: string | null;
  discipline: 'CROSSFIT' | 'HYROX';
  score: string;
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastActivityAt: string | null;
  wodCount: number;
  analysisCount: number;
  strategyCount: number;
  resultCount: number;
  checkinCount: number;
  personalRecordCount: number;
}

export type AdminActivityType =
  | 'WOD'
  | 'ANALYSIS'
  | 'STRATEGY'
  | 'HYROX_STRATEGY'
  | 'RESULT'
  | 'CHECKIN'
  | 'PERSONAL_RECORD';

export interface AdminActivity {
  id: string;
  type: AdminActivityType;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  detail: string | null;
  occurredAt: string;
}

export interface AdminUsersResponse {
  totals: {
    users: number;
    wods: number;
    analyses: number;
    strategies: number;
    results: number;
  };
  users: AdminUserSummary[];
  activities: AdminActivity[];
}

export const api = {
  register: (input: { name: string; email: string; password: string }) =>
    request<{ user: PublicUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    request<{ user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  forgotPassword: (input: { email: string }) =>
    request<{ ok: true; devResetUrl?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  resetPassword: (input: { token: string; newPassword: string }) =>
    request<{ ok: true }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: () => request<{ user: PublicUser }>('/auth/me'),

  getAthleteProfile: () => request<{ profile: Record<string, unknown> }>('/athlete-profile'),

  saveAthleteProfile: (input: Record<string, unknown>) =>
    request<{ profile: Record<string, unknown> }>('/athlete-profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  getTodayCheckin: () => request<{ checkin: DailyCheckin }>('/checkins/today'),

  saveCheckin: (input: DailyCheckinInput) =>
    request<{ checkin: DailyCheckin }>('/checkins', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  submitWod: (input: WodSubmissionInput) => {
    const formData = new FormData();
    if (input.rawText) formData.set('rawText', input.rawText);
    if (input.name) formData.set('name', input.name);
    if (input.notes) formData.set('notes', input.notes);
    if (input.image) formData.set('image', input.image);
    return requestForm<{ wod: Wod }>('/wods', formData);
  },

  listWods: (limit?: number) => request<{ wods: Wod[] }>(`/wods${limit ? `?limit=${limit}` : ''}`),

  getWod: (id: string, signal?: AbortSignal) => request<{ wod: Wod }>(`/wods/${id}`, { signal }),

  updateWod: (id: string, input: { rawText?: string; name?: string; notes?: string }) =>
    request<{ wod: Wod }>(`/wods/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteWod: (id: string) => request<void>(`/wods/${id}`, { method: 'DELETE' }),

  analyzeWod: (id: string) =>
    request<{ analysis: WodAnalysis; wod?: Wod | null }>(`/wods/${id}/analyze`, {
      method: 'POST',
    }),

  getWodAnalysis: (id: string, signal?: AbortSignal) =>
    request<{ analysis: WodAnalysis }>(`/wods/${id}/analysis`, { signal }),

  getWodVersions: (
    id: string,
    cursors: { analysisBefore?: number; strategyBefore?: number } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    if (cursors.analysisBefore !== undefined)
      query.set('analysisBefore', String(cursors.analysisBefore));
    if (cursors.strategyBefore !== undefined)
      query.set('strategyBefore', String(cursors.strategyBefore));
    return request<WodVersions>(`/wods/${encodeURIComponent(id)}/versions?${query}`, { signal });
  },

  updateWodAnalysis: (
    id: string,
    input: {
      durationMinutes?: number | null;
      versionId?: string;
      movementLoads?: Array<{ id: string; loadDescription: string | null }>;
    },
  ) =>
    request<{ analysis: WodAnalysis }>(`/wods/${id}/analysis`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  saveWodResult: (wodId: string, input: WodResultInput) =>
    request<{ result: WodResult }>(`/wods/${wodId}/result`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listPersonalRecords: () => request<{ records: PersonalRecord[] }>('/personal-records'),

  createPersonalRecord: (input: PersonalRecordInput) =>
    request<{ record: PersonalRecord }>('/personal-records', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updatePersonalRecord: (id: string, input: PersonalRecordInput) =>
    request<{ record: PersonalRecord }>(`/personal-records/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deletePersonalRecord: (id: string) =>
    request<void>(`/personal-records/${id}`, { method: 'DELETE' }),

  getAthleteContext: (wodId: string) =>
    request<{ context: AthleteContext }>(`/wods/${wodId}/context`),

  generateStrategy: (wodId: string) =>
    request<{ strategy: WodStrategy }>(`/wods/${wodId}/strategy`, { method: 'POST' }),

  getStrategy: (wodId: string, signal?: AbortSignal) =>
    request<{ strategy: WodStrategy }>(`/wods/${wodId}/strategy`, { signal }),

  generateHyroxStrategy: (input: HyroxStrategyInput) =>
    request<{ strategy: HyroxStrategy }>('/hyrox/strategy', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  submitHyroxWorkout: (input: WodSubmissionInput) => {
    const formData = new FormData();
    if (input.rawText) formData.set('rawText', input.rawText);
    if (input.name) formData.set('name', input.name);
    if (input.notes) formData.set('notes', input.notes);
    if (input.image) formData.set('image', input.image);
    return requestForm<{ workout: HyroxWorkout }>('/hyrox-workouts', formData);
  },

  listHyroxWorkouts: (limit?: number) =>
    request<{ workouts: HyroxWorkout[] }>(`/hyrox-workouts${limit ? `?limit=${limit}` : ''}`),

  getHyroxWorkout: (id: string) => request<{ workout: HyroxWorkout }>(`/hyrox-workouts/${id}`),

  updateHyroxWorkout: (id: string, input: { rawText?: string; name?: string; notes?: string }) =>
    request<{ workout: HyroxWorkout }>(`/hyrox-workouts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteHyroxWorkout: (id: string) => request<void>(`/hyrox-workouts/${id}`, { method: 'DELETE' }),

  analyzeHyroxWorkout: (id: string) =>
    request<{ analysis: WodAnalysis; workout?: HyroxWorkout | null }>(
      `/hyrox-workouts/${id}/analyze`,
      { method: 'POST' },
    ),

  getHyroxAnalysis: (id: string) =>
    request<{ analysis: WodAnalysis }>(`/hyrox-workouts/${id}/analysis`),

  updateHyroxAnalysis: (id: string, input: { durationMinutes: number | null }) =>
    request<{ analysis: WodAnalysis }>(`/hyrox-workouts/${id}/analysis`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  generateHyroxWorkoutStrategy: (id: string) =>
    request<{ strategy: HyroxStrategy }>(`/hyrox-workouts/${id}/strategy`, { method: 'POST' }),

  getHyroxWorkoutStrategy: (id: string) =>
    request<{ strategy: HyroxStrategy }>(`/hyrox-workouts/${id}/strategy`),

  getTrainingFrequency: (weeks?: number) =>
    request<{ weeks: TrainingFrequencyWeek[] }>(
      `/stats/training-frequency${weeks ? `?weeks=${weeks}` : ''}`,
    ),

  getTrainingCalendar: (start: string, end: string, signal?: AbortSignal) =>
    request<{ entries: TrainingCalendarEntry[] }>(
      `/stats/training-calendar?${new URLSearchParams({ start, end })}`,
      { signal },
    ),

  getAdminUsers: () => request<AdminUsersResponse>('/admin/users'),
};
