import { test, expect } from "@playwright/test";
import { makeTestUser, registerTestUser } from "../support/test-user.js";

const API_URL = "http://localhost:3333";

test("a API rejeita um check-in com valores fora do intervalo 1-10", async ({ request }) => {
  const user = makeTestUser();
  await registerTestUser(user);

  const loginResponse = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  expect(loginResponse.ok()).toBe(true);

  const response = await request.post(`${API_URL}/api/checkins`, {
    data: {
      sleep: 11,
      energy: 7,
      stress: 3,
      muscleSoreness: 3,
      jointPain: 1,
      motivation: 8,
    },
  });

  expect(response.status()).toBe(400);
});

test("a API rejeita um check-in sem os campos obrigatórios", async ({ request }) => {
  const user = makeTestUser();
  await registerTestUser(user);

  const loginResponse = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  expect(loginResponse.ok()).toBe(true);

  const response = await request.post(`${API_URL}/api/checkins`, {
    data: { sleep: 8 },
  });

  expect(response.status()).toBe(400);
});
