import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { AdminUserView } from '@bitquiz/shared';
import { ApiError, api } from './api';

/** Loads the signed-in admin; sends the visitor to the login page if there is none. */
export function useAdminSession(): AdminUserView | null {
  const navigate = useNavigate();
  const location = useLocation();
  const [admin, setAdmin] = useState<AdminUserView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<AdminUserView>('/auth/me', { signal: controller.signal })
      .then(setAdmin)
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          navigate(`/admin/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
        }
      });
    return () => controller.abort();
  }, [navigate, location.pathname]);

  return admin;
}

export async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
}
