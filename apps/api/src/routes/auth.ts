import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "@wod-coach-ai/database";
import { registerSchema, loginSchema } from "@wod-coach-ai/validation";
import { AUTH_COOKIE_NAME } from "../plugins/auth.js";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

// Login/registro são o alvo mais óbvio de força bruta — limite bem mais
// apertado que o resto da API (que já tem um limite global mais generoso).
// Aplicado só nestas duas rotas (não em /auth/me, chamada a cada carga de
// página, nem em /auth/logout).
const BRUTE_FORCE_RATE_LIMIT = {
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 100),
  timeWindow: "1 minute",
};

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/register",
    { config: { rateLimit: BRUTE_FORCE_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
      }

      const { name, email, password } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: "E-mail já cadastrado" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({ data: { name, email, passwordHash } });

      const token = app.jwt.sign({ sub: user.id });
      reply.setCookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });

      return reply.code(201).send({ user: publicUser(user) });
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: BRUTE_FORCE_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.code(401).send({ error: "E-mail ou senha inválidos" });
      }

      const token = app.jwt.sign({ sub: user.id });
      reply.setCookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });

      return reply.send({ user: publicUser(user) });
    },
  );

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return reply.code(404).send({ error: "Usuário não encontrado" });
    }
    return reply.send({ user: publicUser(user) });
  });
}
