/**
 * Trusted reverse-proxy authentication.
 *
 * When Umami sits behind an authenticating reverse proxy (corporate SSO), the proxy
 * injects headers identifying the signed-in user. If AUTH_PROXY_USER_HEADER is set,
 * those headers are trusted and matched against existing Umami users by username.
 *
 * Only enable this when Umami is reachable exclusively through the proxy and the proxy
 * strips any client-supplied copies of these headers.
 */

export interface ProxyIdentity {
  userId: string | null;
  email: string | null;
  name: string | null;
}

function headerName(key: string) {
  return process.env[key]?.trim().toLowerCase() || null;
}

function readHeader(request: Request, key: string) {
  const name = headerName(key);
  const value = name ? request.headers.get(name)?.trim() : null;

  return value || null;
}

export function isProxyAuthEnabled() {
  return !!headerName('AUTH_PROXY_USER_HEADER') && !process.env.CLOUD_MODE;
}

export function getProxyAccessUrl() {
  return process.env.AUTH_PROXY_ACCESS_URL || null;
}

export function getProxyIdentity(request: Request): ProxyIdentity | null {
  if (!isProxyAuthEnabled()) {
    return null;
  }

  const identity = {
    userId: readHeader(request, 'AUTH_PROXY_USER_HEADER'),
    email: readHeader(request, 'AUTH_PROXY_EMAIL_HEADER'),
    name: readHeader(request, 'AUTH_PROXY_NAME_HEADER'),
  };

  return identity.userId || identity.email ? identity : null;
}

/** Usernames the identity may sign in as, in match order: proxy user id, then email. */
export function getProxyUsernames(identity: ProxyIdentity) {
  return [identity.userId, identity.email]
    .filter(Boolean)
    .map(value => value.toLowerCase())
    .filter((value, index, values) => values.indexOf(value) === index);
}

export function proxyIdentityMatches(identity: ProxyIdentity, username: string) {
  return getProxyUsernames(identity).includes(username?.toLowerCase());
}
