import { saveAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { hash, secret } from '@/lib/crypto';
import { createSecureToken } from '@/lib/jwt';
import {
  getProxyAccessUrl,
  getProxyIdentity,
  getProxyUsernames,
  isProxyAuthEnabled,
} from '@/lib/proxy-auth';
import redis from '@/lib/redis';
import { parseRequest } from '@/lib/request';
import { forbidden, json, notFound, unauthorized } from '@/lib/response';
import { getAllUserTeams, getUserByUsername } from '@/queries/prisma';

export async function POST(request: Request) {
  const { error } = await parseRequest(request, null, { skipAuth: true });

  if (error) {
    return error();
  }

  if (!isProxyAuthEnabled()) {
    return notFound();
  }

  const identity = getProxyIdentity(request);

  if (!identity) {
    return unauthorized({ code: 'proxy-auth-missing' });
  }

  let user = null;

  for (const username of getProxyUsernames(identity)) {
    user = await getUserByUsername(username, { includePassword: true });

    if (user) {
      break;
    }
  }

  if (!user) {
    return forbidden({
      code: 'proxy-auth-no-user',
      name: identity.name || identity.userId || identity.email,
      accessUrl: getProxyAccessUrl(),
    });
  }

  const { id, username, role, createdAt } = user;

  // The proxy has already authenticated the user, so the password and 2FA steps are skipped.
  // Bind token to password hash so a password change invalidates old tokens.
  const pwd = hash(user.password);

  let token: string;

  if (redis.enabled) {
    token = await saveAuth({ userId: id, role, pwd });
  } else {
    token = createSecureToken({ userId: id, role, pwd }, secret());
  }

  const teams = await getAllUserTeams(id);

  return json({
    token,
    user: { id, username, role, createdAt, isAdmin: role === ROLES.admin, teams },
  });
}
