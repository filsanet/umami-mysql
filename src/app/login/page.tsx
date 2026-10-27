import type { Metadata } from 'next';
import { isProxyAuthEnabled } from '@/lib/proxy-auth';
import { LoginPage } from './LoginPage';

export const dynamic = 'force-dynamic';

export default async function () {
  if (process.env.DISABLE_LOGIN || process.env.CLOUD_MODE) {
    return null;
  }

  return <LoginPage proxyAuth={isProxyAuthEnabled()} />;
}

export const metadata: Metadata = {
  title: 'Login',
};
