// Em produção o frontend é servido pela própria API (mesma origem), então
// o padrão é string vazia (caminho relativo). Em dev, aponta pro Fastify
// rodando em outra porta via VITE_API_URL.
const API_URL = import.meta.env.VITE_API_URL ?? "";

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
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error ?? "Erro inesperado");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error ?? "Erro inesperado");
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
  sleep: number;
  energy: number;
  stress: number;
  muscleSoreness: number;
  jointPain: number;
  motivation: number;
  weightKg: number | null;
  notes: string | null;
  readinessScore: number;
  readinessBand: "low" | "moderate" | "high";
  cautionFlags: string[];
}

export interface DailyCheckinInput {
  sleep: number;
  energy: number;
  stress: number;
  muscleSoreness: number;
  jointPain: number;
  motivation: number;
  weightKg?: number;
  notes?: string;
}

export type WodSourceType = "TEXT" | "IMAGE" | "TEXT_AND_IMAGE";

export type StrategyOutcome = "YES" | "PARTIALLY" | "NO";

export interface WodFeedback {
  id: string;
  strategyWorked: StrategyOutcome | null;
  gripScore: number | null;
  legsScore: number | null;
  breathingScore: number | null;
  overallDifficulty: number | null;
  whereItBroke: string | null;
  notes: string | null;
}

export interface WodResult {
  id: string;
  score: string;
  timeSeconds: number | null;
  rounds: number | null;
  reps: number | null;
  load: number | null;
  distance: number | null;
  rpe: number;
  feedback: WodFeedback | null;
}

export interface WodResultInput {
  score: string;
  timeSeconds?: number;
  rounds?: number;
  reps?: number;
  load?: number;
  distance?: number;
  rpe: number;
}

export interface WodFeedbackInput {
  strategyWorked?: StrategyOutcome;
  gripScore?: number;
  legsScore?: number;
  breathingScore?: number;
  overallDifficulty?: number;
  whereItBroke?: string;
  notes?: string;
}

export interface Wod {
  id: string;
  userId: string;
  date: string;
  sourceType: WodSourceType;
  rawText: string | null;
  imageMimeType: string | null;
  imageData?: string | null;
  name: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  result?: WodResult | { score: string; rpe: number } | null;
}

export interface WodSubmissionInput {
  rawText?: string;
  name?: string;
  notes?: string;
  image?: File;
}

export type WodFormat =
  | "AMRAP"
  | "FOR_TIME"
  | "EMOM"
  | "E2MOM"
  | "CHIPPER"
  | "ROUNDS_FOR_TIME"
  | "STRENGTH"
  | "INTERVAL";

export type MovementCategory =
  | "gymnastics"
  | "weightlifting"
  | "conditioning"
  | "monostructural"
  | "mixed_modal";

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

export interface WodAnalysis {
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
}

export interface PersonalRecord {
  id: string;
  movementName: string;
  value: number;
  unit: string;
  achievedAt: string;
  notes: string | null;
}

export interface PersonalRecordInput {
  movementName: string;
  value: number;
  unit: string;
  achievedAt?: string;
  notes?: string;
}

export interface TrainingLoadWindow {
  days: number;
  sessionCount: number;
  averageRpe: number | null;
  averageReadiness: number | null;
}

export type ReadinessTrend = "improving" | "stable" | "declining" | "insufficient_data";
export type DataSufficiency = "low" | "moderate" | "high";

export interface SimilarWodMatch {
  wodId: string;
  date: string;
  similarityScore: number;
  result: { score: string; rpe: number } | null;
  feedback: {
    gripScore: number | null;
    legsScore: number | null;
    overallDifficulty: number | null;
    whereItBroke: string | null;
  } | null;
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
  readinessTrend: ReadinessTrend;
  similarWods: SimilarWodMatch[];
  relevantPersonalRecords: Array<{
    movementName: string;
    value: number;
    unit: string;
    achievedAt: string;
  }>;
  dataSufficiency: DataSufficiency;
}

export interface StrategyMovementNote {
  movement: string;
  strategy: string;
}

export interface WodStrategy {
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

export const api = {
  register: (input: { name: string; email: string; password: string }) =>
    request<{ user: PublicUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    request<{ user: PublicUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  me: () => request<{ user: PublicUser }>("/auth/me"),

  getAthleteProfile: () => request<{ profile: Record<string, unknown> }>("/athlete-profile"),

  saveAthleteProfile: (input: Record<string, unknown>) =>
    request<{ profile: Record<string, unknown> }>("/athlete-profile", {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  getTodayCheckin: () => request<{ checkin: DailyCheckin }>("/checkins/today"),

  saveCheckin: (input: DailyCheckinInput) =>
    request<{ checkin: DailyCheckin }>("/checkins", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  submitWod: (input: WodSubmissionInput) => {
    const formData = new FormData();
    if (input.rawText) formData.set("rawText", input.rawText);
    if (input.name) formData.set("name", input.name);
    if (input.notes) formData.set("notes", input.notes);
    if (input.image) formData.set("image", input.image);
    return requestForm<{ wod: Wod }>("/wods", formData);
  },

  listWods: () => request<{ wods: Wod[] }>("/wods"),

  getWod: (id: string) => request<{ wod: Wod }>(`/wods/${id}`),

  updateWod: (id: string, input: { rawText?: string; name?: string; notes?: string }) =>
    request<{ wod: Wod }>(`/wods/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  deleteWod: (id: string) => request<void>(`/wods/${id}`, { method: "DELETE" }),

  analyzeWod: (id: string) =>
    request<{ analysis: WodAnalysis }>(`/wods/${id}/analyze`, { method: "POST" }),

  getWodAnalysis: (id: string) => request<{ analysis: WodAnalysis }>(`/wods/${id}/analysis`),

  saveWodResult: (wodId: string, input: WodResultInput) =>
    request<{ result: WodResult }>(`/wods/${wodId}/result`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  saveWodFeedback: (wodId: string, input: WodFeedbackInput) =>
    request<{ feedback: WodFeedback }>(`/wods/${wodId}/feedback`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  listPersonalRecords: () => request<{ records: PersonalRecord[] }>("/personal-records"),

  createPersonalRecord: (input: PersonalRecordInput) =>
    request<{ record: PersonalRecord }>("/personal-records", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deletePersonalRecord: (id: string) =>
    request<void>(`/personal-records/${id}`, { method: "DELETE" }),

  getAthleteContext: (wodId: string) =>
    request<{ context: AthleteContext }>(`/wods/${wodId}/context`),

  generateStrategy: (wodId: string) =>
    request<{ strategy: WodStrategy }>(`/wods/${wodId}/strategy`, { method: "POST" }),

  getStrategy: (wodId: string) => request<{ strategy: WodStrategy }>(`/wods/${wodId}/strategy`),
};
