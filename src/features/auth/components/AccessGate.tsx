import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { useAuth } from './AuthProvider';
import { hasPermission } from '../model/identity';
import { Empty, Button } from '@shared/ui';
export function AccessGate({
  children,
  permission,
  returnTo,
}: {
  children: ReactNode;
  permission?: string;
  returnTo?: 'checkout' | 'requirements';
}) {
  const auth = useAuth();
  if (!auth.ready)
    return (
      <Empty
        title="Opening your account"
        description="Restoring your session securely."
      />
    );
  if (!auth.session)
    return (
      <Empty
        title="Sign in to continue"
        description="Use your WhatsApp number to access your account."
        action={
          <Button onPress={() => router.push(returnTo ? { pathname: '/login', params: { returnTo } } : '/login')}>
            Sign in with WhatsApp
          </Button>
        }
      />
    );
  if (auth.loading)
    return (
      <Empty
        title="Loading your account"
        description="Checking your access permissions."
      />
    );
  if (auth.error)
    return (
      <Empty
        title="Account unavailable"
        description={auth.error}
        action={
          <Button onPress={() => void auth.refresh()}>Retry account</Button>
        }
      />
    );
  if (
    !auth.identity ||
    (permission && !hasPermission(auth.identity, permission))
  )
    return (
      <Empty
        title="Access restricted"
        description="Your account does not have permission to open this workspace."
      />
    );
  return <>{children}</>;
}
