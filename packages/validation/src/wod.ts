import { z } from "zod";

export const wodSourceTypeSchema = z.enum(["TEXT", "IMAGE", "TEXT_AND_IMAGE"]);

// Validação dos campos de texto do envio de WOD. A imagem (quando presente)
// é recebida via multipart e validada separadamente (tipo MIME e tamanho).
export const wodSubmissionFieldsSchema = z.object({
  date: z.coerce.date().optional(),
  rawText: z.string().trim().min(1).max(10_000).optional(),
  name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type WodSubmissionFields = z.infer<typeof wodSubmissionFieldsSchema>;

// Edição de um WOD já enviado (só os campos de texto — a imagem não é editável).
export const wodUpdateFieldsSchema = z.object({
  rawText: z.string().trim().min(1).max(10_000).optional(),
  name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type WodUpdateFields = z.infer<typeof wodUpdateFieldsSchema>;

export const WOD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const WOD_IMAGE_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
