import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import './index.css';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Each area loads on demand, so phones only download the participant screen.
const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/play', lazy: async () => ({ Component: (await import('./pages/play/PlayPage')).PlayPage }) },
  { path: '/play/:joinCode', lazy: async () => ({ Component: (await import('./pages/play/PlayPage')).PlayPage }) },
  { path: '/screen/:token', lazy: async () => ({ Component: (await import('./pages/screen/ScreenPage')).ScreenPage }) },
  { path: '/admin/login', lazy: async () => ({ Component: (await import('./pages/admin/LoginPage')).LoginPage }) },
  {
    path: '/admin',
    lazy: async () => ({ Component: (await import('./pages/admin/AdminLayout')).AdminLayout }),
    children: [
      { index: true, lazy: async () => ({ Component: (await import('./pages/admin/CompetitionsPage')).CompetitionsPage }) },
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
      { path: 'admins', lazy: async () => ({ Component: (await import('./pages/admin/AdminsPage')).AdminsPage }) },
    ],
  },
  {
    path: '/admin/competitions/:id/console',
    lazy: async () => ({ Component: (await import('./pages/console/ConsolePage')).ConsolePage }),
  },
  { path: '*', element: <NotFoundPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster theme="dark" position="top-center" richColors closeButton />
  </StrictMode>,
);
