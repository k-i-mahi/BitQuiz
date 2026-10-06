import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import './index.css';
import { ErrorPage } from './pages/ErrorPage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Each area loads on demand, so phones only download the participant screen.
// The pathless parent catches render errors and failed chunk loads (e.g. right after a deploy).
const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/play', lazy: async () => ({ Component: (await import('./pages/play/PlayPage')).PlayPage }) },
      { path: '/play/:joinCode', lazy: async () => ({ Component: (await import('./pages/play/PlayPage')).PlayPage }) },
      {
        path: '/screen/:token',
        lazy: async () => ({ Component: (await import('./pages/screen/ScreenPage')).ScreenPage }),
      },
      { path: '/admin/login', lazy: async () => ({ Component: (await import('./pages/admin/LoginPage')).LoginPage }) },
      {
        path: '/admin/forgot-password',
        lazy: async () => ({ Component: (await import('./pages/admin/AccountLinkPages')).ForgotPasswordPage }),
      },
      {
        path: '/admin/reset-password',
        lazy: async () => ({ Component: (await import('./pages/admin/AccountLinkPages')).ResetPasswordPage }),
      },
      {
        path: '/admin/accept-invite',
        lazy: async () => ({ Component: (await import('./pages/admin/AccountLinkPages')).AcceptInvitePage }),
      },
      {
        path: '/admin/verify-email',
        lazy: async () => ({ Component: (await import('./pages/admin/AccountLinkPages')).VerifyEmailPage }),
      },
      {
        path: '/admin',
        lazy: async () => ({ Component: (await import('./pages/admin/AdminLayout')).AdminLayout }),
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('./pages/admin/CompetitionsPage')).CompetitionsPage }),
          },
          {
            path: 'competitions',
            lazy: async () => ({ Component: (await import('./pages/admin/CompetitionsPage')).CompetitionsPage }),
          },
          {
            path: 'competitions/:id/edit',
            lazy: async () => ({ Component: (await import('./pages/admin/EditorPage')).EditorPage }),
          },
          {
            path: 'competitions/:id/results',
            lazy: async () => ({ Component: (await import('./pages/admin/ResultsPage')).ResultsPage }),
          },
          { path: 'team', lazy: async () => ({ Component: (await import('./pages/admin/TeamPage')).TeamPage }) },
        ],
      },
      {
        path: '/admin/competitions/:id/console',
        lazy: async () => ({ Component: (await import('./pages/console/ConsolePage')).ConsolePage }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster theme="dark" position="top-center" richColors closeButton />
  </StrictMode>,
);
