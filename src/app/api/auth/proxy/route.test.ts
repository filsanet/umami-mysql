import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseRequest: vi.fn(),
  getUserByUsername: vi.fn(),
  getAllUserTeams: vi.fn(),
  createSecureToken: vi.fn(),
  saveAuth: vi.fn(),
}));

vi.mock('@/lib/request', () => ({
  parseRequest: mocks.parseRequest,
}));

vi.mock('@/queries/prisma', () => ({
  getAllUserTeams: mocks.getAllUserTeams,
  getUserByUsername: mocks.getUserByUsername,
}));

vi.mock('@/lib/jwt', () => ({
  createSecureToken: mocks.createSecureToken,
}));

vi.mock('@/lib/crypto', () => ({
  hash: (value: string) => `hash(${value})`,
  secret: () => 'secret',
}));

vi.mock('@/lib/auth', () => ({
  saveAuth: mocks.saveAuth,
}));

vi.mock('@/lib/redis', () => ({
  default: {
    enabled: false,
  },
}));

import { POST } from './route';

const ALICE = {
  id: 'user-1',
  username: 'alice',
  password: 'hashed-password',
  role: 'user',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
};

function proxyRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/auth/proxy', { method: 'POST', headers });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('CLOUD_MODE', '');
  vi.stubEnv('AUTH_PROXY_USER_HEADER', 'X-NOM-USER');
  vi.stubEnv('AUTH_PROXY_EMAIL_HEADER', 'X-NOM-MAIL');
  vi.stubEnv('AUTH_PROXY_NAME_HEADER', 'X-NOM-COMMON-NAME');
  vi.stubEnv('AUTH_PROXY_ACCESS_URL', 'https://intranet.example.com/umami-access');

  mocks.parseRequest.mockReset();
  mocks.getUserByUsername.mockReset();
  mocks.getAllUserTeams.mockReset();
  mocks.createSecureToken.mockReset();
  mocks.saveAuth.mockReset();

  mocks.parseRequest.mockResolvedValue({ error: undefined });
  mocks.getUserByUsername.mockResolvedValue(null);
  mocks.getAllUserTeams.mockResolvedValue([]);
  mocks.createSecureToken.mockReturnValue('session-token');
});

test('returns 404 when proxy auth is not configured', async () => {
  vi.stubEnv('AUTH_PROXY_USER_HEADER', '');

  const response = await POST(proxyRequest({ 'x-nom-user': 'alice' }));

  expect(response.status).toBe(404);
  expect(mocks.getUserByUsername).not.toHaveBeenCalled();
});

test('returns 401 when the proxy headers are missing', async () => {
  const response = await POST(proxyRequest());

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: 'proxy-auth-missing' },
  });
});

test('signs in the user whose username matches the proxy user id', async () => {
  mocks.getUserByUsername.mockImplementation(async (username: string) =>
    username === 'alice' ? ALICE : null,
  );

  const response = await POST(
    proxyRequest({ 'x-nom-user': 'Alice', 'x-nom-mail': 'alice@example.com' }),
  );

  expect(response.status).toBe(200);
  expect(mocks.getUserByUsername).toHaveBeenCalledTimes(1);
  expect(mocks.createSecureToken).toHaveBeenCalledWith(
    { userId: 'user-1', role: 'user', pwd: 'hash(hashed-password)' },
    'secret',
  );
  await expect(response.json()).resolves.toMatchObject({
    token: 'session-token',
    user: { id: 'user-1', username: 'alice', isAdmin: false, teams: [] },
  });
});

test('falls back to matching the email address', async () => {
  mocks.getUserByUsername.mockImplementation(async (username: string) =>
    username === 'alice@example.com' ? { ...ALICE, username: 'alice@example.com' } : null,
  );

  const response = await POST(
    proxyRequest({ 'x-nom-user': 'a12345', 'x-nom-mail': 'Alice@Example.com' }),
  );

  expect(response.status).toBe(200);
  expect(mocks.getUserByUsername.mock.calls.map(([username]) => username)).toEqual([
    'a12345',
    'alice@example.com',
  ]);
});

test('returns 403 with the access instructions link when no user matches', async () => {
  const response = await POST(
    proxyRequest({ 'x-nom-user': 'nobody', 'x-nom-mail': 'nobody@example.com' }),
  );

  expect(response.status).toBe(403);
  expect(mocks.createSecureToken).not.toHaveBeenCalled();
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: 'proxy-auth-no-user',
      name: 'nobody',
      accessUrl: 'https://intranet.example.com/umami-access',
    },
  });
});
