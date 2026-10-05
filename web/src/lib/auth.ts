import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { AdminUserView } from '@bitquiz/shared';
import { ApiError, api } from './api';

/**
 * Loads the signed-in admin and lets the page update it (e.g. after editing the profile).
 * Sends the visitor to the login page if there is no valid session.
 */
export function useAdminSessionState(): [AdminUserView | null, (admin: AdminUserView) => void] {
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

  return [admin, setAdmin];
}

export function useAdminSession(): AdminUserView | null {
  return useAdminSessionState()[0];
}

export async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
}
