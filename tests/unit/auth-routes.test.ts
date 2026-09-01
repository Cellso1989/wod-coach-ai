import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "../../apps/api/src/app.js";

describe("auth routes input validation", () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it("rejects registration with an invalid email before touching the database", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "Atleta", email: "not-an-email", password: "supersecret123" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects login with a missing password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "athlete@example.com" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects access to /auth/me without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects access to /athlete-profile without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/athlete-profile" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects access to /checkins without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/checkins" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects an invalid check-in payload without a valid session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/checkins",
      payload: { sleep: 5 },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects access to /wods without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/wods" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects access to /wods/:id without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/wods/some-id" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects triggering an analysis without a valid session", async () => {
    const response = await app.inject({ method: "POST", url: "/api/wods/some-id/analyze" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects reading an analysis without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/wods/some-id/analysis" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects registering a WOD result without a valid session", async () => {
    const response = await app.inject({ method: "POST", url: "/api/wods/some-id/result" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects registering WOD feedback without a valid session", async () => {
    const response = await app.inject({ method: "POST", url: "/api/wods/some-id/feedback" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects access to /personal-records without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/personal-records" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects creating a personal record without a valid session", async () => {
    const response = await app.inject({ method: "POST", url: "/api/personal-records" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects reading athlete context without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/wods/some-id/context" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects generating a strategy without a valid session", async () => {
    const response = await app.inject({ method: "POST", url: "/api/wods/some-id/strategy" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects reading a strategy without a valid session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/wods/some-id/strategy" });
    expect(response.statusCode).toBe(401);
  });
});
