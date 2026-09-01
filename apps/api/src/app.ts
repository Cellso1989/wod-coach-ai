import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { WOD_IMAGE_MAX_BYTES } from "@wod-coach-ai/validation";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import athleteProfileRoutes from "./routes/athlete-profile.js";
import dailyCheckinRoutes from "./routes/daily-checkin.js";
import wodRoutes from "./routes/wod.js";
import wodAnalysisRoutes from "./routes/wod-analysis.js";
import wodResultRoutes from "./routes/wod-result.js";
import personalRecordRoutes from "./routes/personal-record.js";
import athleteContextRoutes from "./routes/athlete-context.js";
import wodStrategyRoutes from "./routes/wod-strategy.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(errorHandlerPlugin);
  app.register(helmet, {
    // A API é consumida por um frontend separado (não serve HTML), então
    // a CSP restritiva padrão do helmet não se aplica aqui.
    contentSecurityPolicy: false,
  });
  app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: "1 minute",
  });
  app.register(cors, { origin: true, credentials: true });

  // Todas as rotas de API vivem sob /api — necessário porque, em produção,
  // a própria API também serve o build do frontend (mesma origem, evita
  // problemas de cookie cross-site) e o frontend usa caminhos como
  // "/wods" para suas próprias páginas, que colidiriam com a rota de
  // API "GET /wods" se não houvesse esse prefixo.
  app.register(
    async (api) => {
      api.register(multipart, {
        limits: { fileSize: WOD_IMAGE_MAX_BYTES, files: 1 },
      });
      api.register(authPlugin);
      api.register(authRoutes);
      api.register(athleteProfileRoutes);
      api.register(dailyCheckinRoutes);
      api.register(wodRoutes);
      api.register(wodAnalysisRoutes);
      api.register(wodResultRoutes);
      api.register(personalRecordRoutes);
      api.register(athleteContextRoutes);
      api.register(wodStrategyRoutes);
    },
    { prefix: "/api" },
  );

  app.get("/health", async () => {
    return { status: "ok", service: "wod-coach-ai-api" };
  });

  // Em produção o build do frontend é servido pela própria API. Em dev,
  // o Vite serve o frontend separadamente na porta 5173 e este diretório
  // não existe, então o bloco abaixo simplesmente não é registrado.
  const webDistDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  const serveFrontend = fs.existsSync(webDistDir);
  if (serveFrontend) {
    app.register(staticPlugin, { root: webDistDir });
  }

  // Único setNotFoundHandler da instância (o Fastify só permite um por
  // prefixo) — decide entre JSON 404 (API) e fallback pro SPA (frontend,
  // só quando o build dele está sendo servido nesta instância).
  app.setNotFoundHandler((request, reply) => {
    if (!serveFrontend || request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Rota não encontrada" });
    }
    // Qualquer outra rota GET é uma página do SPA (React Router cuida
    // do roteamento no client) — devolve o index.html com 200, não 404
    // (senão o fetch() do frontend trataria a própria página como erro).
    return reply.code(200).sendFile("index.html");
  });

  return app;
}
