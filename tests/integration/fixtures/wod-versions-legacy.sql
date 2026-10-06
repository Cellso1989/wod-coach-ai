INSERT INTO "users" ("id", "email", "passwordHash", "name", "updatedAt")
VALUES ('version-legacy-user', 'legacy@example.test', 'test-only', 'Legacy athlete', CURRENT_TIMESTAMP);
INSERT INTO "personal_records" ("id", "userId", "movementName", "value", "unit", "updatedAt")
VALUES ('version-legacy-pr', 'version-legacy-user', 'Legacy lift', 100, 'kg', CURRENT_TIMESTAMP);
INSERT INTO "wods" ("id", "userId", "date", "sourceType", "discipline", "rawText", "updatedAt")
VALUES ('version-legacy-wod', 'version-legacy-user', CURRENT_TIMESTAMP, 'TEXT', 'CROSSFIT', 'AMRAP 15: 10 T2B', CURRENT_TIMESTAMP),
       ('version-legacy-hyrox', 'version-legacy-user', CURRENT_TIMESTAMP, 'TEXT', 'HYROX', 'Run 1000m', CURRENT_TIMESTAMP);
INSERT INTO "wod_analyses" ("id", "wodId", "format", "durationMinutes", "confidence", "warnings", "rawResponse", "updatedAt")
VALUES ('version-legacy-analysis', 'version-legacy-wod', 'AMRAP', 15, 0.8, '{}', '{}', CURRENT_TIMESTAMP),
       ('version-legacy-hyrox-analysis', 'version-legacy-hyrox', 'FOR_TIME', 20, 0.8, '{}', '{}', CURRENT_TIMESTAMP);
INSERT INTO "wod_movements" ("id", "wodAnalysisId", "order", "name", "category", "reps")
VALUES ('version-legacy-movement', 'version-legacy-analysis', 0, 'Toes to Bar', 'gymnastics', 10);
INSERT INTO "wod_strategies" ("id", "wodId", "recommendedIntensity", "targetRpe", "pacing", "restStrategy", "transitionStrategy", "energyManagement", "goal", "breakStrategy", "movementStrategy", "confidence", "warnings", "rawResponse", "updatedAt")
VALUES ('version-legacy-strategy', 'version-legacy-wod', 9, 10, 'Steady', 'Short breaks', 'Fast transitions', 'Save grip', '8 rounds',
        '[{"movement":"Toes to Bar","strategy":"6/4"}]', '[{"movement":"Toes to Bar","strategy":"Steady kip"}]', 0.8, '{}', '{}', CURRENT_TIMESTAMP);
