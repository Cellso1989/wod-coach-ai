import { z } from "zod";
import { WOD_FORMATS, MOVEMENT_CATEGORIES } from "@wod-coach-ai/types";

export const wodFormatSchema = z.enum(WOD_FORMATS);
export const movementCategorySchema = z.enum(MOVEMENT_CATEGORIES);
