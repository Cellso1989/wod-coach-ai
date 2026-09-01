import type { FastifyInstance } from "fastify";
import {
  getAthleteContextForWod,
  WodNotFoundError,
  WodNotAnalyzedError,
} from "../services/athlete-context-service.js";

export default async function athleteContextRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/wods/:id/context", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { context } = await getAthleteContextForWod(request.user.sub, id);
      return reply.send({ context });
    } catch (err) {
      if (err instanceof WodNotFoundError) {
        return reply.code(404).send({ error: "WOD not found" });
      }
      if (err instanceof WodNotAnalyzedError) {
        return reply
          .code(409)
          .send({ error: "Analyze this WOD before requesting athlete context" });
      }
      throw err;
    }
  });
}
