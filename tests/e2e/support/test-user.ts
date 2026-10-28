const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3333';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/**
 * Creates a fresh athlete and approves it through the real administrator API.
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD must identify an approved test administrator.
 */
export function makeTestUser(): TestUser {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  return {
    name: 'Playwright Athlete',
    email: `playwright-${unique}@example.com`,
    password: 'supersecret123',
  };
}

export async function registerTestUser(user: TestUser): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!response.ok) {
    throw new Error(`Failed to register test user: ${response.status} ${await response.text()}`);
  }
  const { user: created } = (await response.json()) as { user: { id: string } };
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for the test environment.');
  const login = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const identity = (await login.json()) as { user?: { isAdmin: boolean } };
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!login.ok || !cookie || !identity.user?.isAdmin)
    throw new Error('The E2E administrator could not sign in.');
  const approved = await fetch(`${API_URL}/api/admin/users/${created.id}/access`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  if (!approved.ok) throw new Error(`Failed to approve test user: ${approved.status}`);
}
