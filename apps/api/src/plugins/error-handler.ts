import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

/**
 * Centralized error handling (Fase 12 — hardening):
 * - Zod validation errors that slip past a route's manual safeParse
 *   (e.g. thrown from deeper code) become a clean 400, not a 500.
 * - Prisma errors never leak internal details (query text, column
 *   names) to the client — known cases map to sensible HTTP codes,
 *   everything else becomes an opaque 500.
 * - Every unhandled error is still logged in full server-side.
 */
export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");

    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid input", details: error.flatten() });
    }

    // Fastify's own validation/parsing errors (bad JSON body, etc.)
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    // Prisma known-request errors: surface a generic conflict for
    // unique-constraint violations, hide everything else.
    const prismaCode = "code" in error ? (error as { code?: unknown }).code : undefined;
    if (prismaCode === "P2002") {
      return reply.code(409).send({ error: "This record already exists" });
    }
    if (prismaCode === "P2025") {
      return reply.code(404).send({ error: "Record not found" });
    }

    return reply.code(500).send({ error: "Internal server error" });
  });

  // O notFoundHandler é registrado em app.ts (único lugar permitido pelo
  // Fastify por instância) — precisa decidir ali entre JSON 404 (API) e
  // fallback para o SPA (frontend), o que exige saber se o build do
  // frontend está sendo servido.
});
