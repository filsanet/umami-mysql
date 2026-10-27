'use client';
import { Column, Loading } from '@umami/react-zen';
import { useRouter } from 'next/navigation';
import { type PropsWithChildren, useEffect } from 'react';
import { useLoginQuery } from '@/components/hooks';
import { LoginForm } from './LoginForm';
import { ProxyLogin } from './ProxyLogin';

export function LoginPageWrapper({ children }: PropsWithChildren) {
  const { user, isLoading } = useLoginQuery();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  if (isLoading || user) {
    return <Loading placement="absolute" />;
  }

  return (
    <Column
      alignItems="center"
      justifyContent="flex-start"
      height="100vh"
      backgroundColor="surface-raised"
      style={{ paddingTop: '15vh' }}
    >
      {children}
    </Column>
  );
}

export function LoginPage({ proxyAuth = false }: { proxyAuth?: boolean }) {
  return <LoginPageWrapper>{proxyAuth ? <ProxyLogin /> : <LoginForm />}</LoginPageWrapper>;
}
