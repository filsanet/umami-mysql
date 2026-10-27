import { Column, Heading, Icon, Loading, Text } from '@umami/react-zen';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LinkButton } from '@/components/common/LinkButton';
import { useMessages } from '@/components/hooks';
import { Logo } from '@/components/svg';
import { getApiUrl } from '@/lib/api-url';
import { setClientAuthToken } from '@/lib/client';
import { httpPost } from '@/lib/fetch';
import { consumeReturnUrl } from '@/lib/return-url';
import { setUser } from '@/store/app';
import { LoginForm } from './LoginForm';

interface NoAccess {
  name?: string;
  accessUrl?: string;
}

/**
 * Signs in with the identity injected by the authenticating reverse proxy.
 * Falls back to the password form when the proxy did not identify the user.
 */
export function ProxyLogin() {
  const { t, labels, messages } = useMessages();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'no-access' | 'fallback'>('loading');
  const [noAccess, setNoAccess] = useState<NoAccess>({});

  useEffect(() => {
    httpPost(getApiUrl('/auth/proxy'))
      .then(({ ok, status, data }) => {
        if (ok) {
          setClientAuthToken(data.token);
          setUser(data.user);
          router.replace(consumeReturnUrl() ?? '/');
        } else if (status === 403 && data?.error?.code === 'proxy-auth-no-user') {
          setNoAccess(data.error);
          setState('no-access');
        } else {
          setState('fallback');
        }
      })
      .catch(() => setState('fallback'));
  }, [router]);

  if (state === 'fallback') {
    return <LoginForm />;
  }

  if (state === 'loading') {
    return <Loading placement="absolute" />;
  }

  return (
    <Column justifyContent="center" alignItems="center" gap="6" style={{ maxWidth: 420 }}>
      <Icon size="lg">
        <Logo />
      </Icon>
      <Heading>umami</Heading>
      <Text align="center">{t(messages.proxyNoAccess, { name: noAccess.name || '' })}</Text>
      {noAccess.accessUrl ? (
        <LinkButton href={noAccess.accessUrl} variant="primary" asAnchor>
          {t(labels.accessInstructions)}
        </LinkButton>
      ) : (
        <Text align="center" color="muted">
          {t(messages.proxyNoAccessContact)}
        </Text>
      )}
    </Column>
  );
}
