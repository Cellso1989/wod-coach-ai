const API_URL = "http://localhost:3333";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/**
 * Creates a brand-new athlete directly against the API (not through the
 * UI) so each test starts from a clean, isolated account without
 * depending on/slowing down on the registration flow itself.
 */
export function makeTestUser(): TestUser {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  return {
    name: "Playwright Athlete",
    email: `playwright-${unique}@example.com`,
    password: "supersecret123",
  };
}

export async function registerTestUser(user: TestUser): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!response.ok) {
    throw new Error(`Failed to register test user: ${response.status} ${await response.text()}`);
  }
}
