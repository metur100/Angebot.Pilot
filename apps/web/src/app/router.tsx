import type { ComponentType } from 'react';
import { createHashRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/Toast';
import { NotFoundPage, RouteErrorPage } from '@/features/system/SystemPages';
import { CompanyProvider } from './company';
import { FullScreenLoader, PublicOnly, RequireAuth, RootRedirect } from './guards';

/** Lazy route helper: page modules export a default component. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}

function CompanyShell() {
  return (
    <CompanyProvider>
      <AppShell />
    </CompanyProvider>
  );
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <FullScreenLoader />,
    children: [
      { index: true, element: <RootRedirect /> },

      // Public customer page (no login, no app chrome)
      { path: 'q/:token', lazy: page(() => import('@/features/public/PublicQuotationPage')) },
      { path: 'q/:token/bestaetigt', lazy: page(() => import('@/features/public/PublicConfirmationPage')) },

      // Links from emails – work signed in or out
      { path: 'reset-password', lazy: page(() => import('@/features/auth/ResetPasswordPage')) },
      { path: 'verify-email', lazy: page(() => import('@/features/auth/VerifyEmailPage')) },
      { path: 'invite', lazy: page(() => import('@/features/auth/InvitePage')) },

      {
        element: <PublicOnly />,
        children: [
          { path: 'login', lazy: page(() => import('@/features/auth/LoginPage')) },
          { path: 'registrieren', lazy: page(() => import('@/features/auth/RegisterPage')) },
          { path: 'register', element: <Navigate to="/registrieren" replace /> },
          { path: 'passwort-vergessen', lazy: page(() => import('@/features/auth/ForgotPasswordPage')) },
        ],
      },

      {
        element: <RequireAuth />,
        children: [
          { path: 'onboarding', lazy: page(() => import('@/features/onboarding/OnboardingPage')) },
          {
            element: <CompanyShell />,
            children: [
              { path: 'dashboard', lazy: page(() => import('@/features/dashboard/DashboardPage')) },
              { path: 'angebote', lazy: page(() => import('@/features/quotations/QuotationListPage')) },
              { path: 'angebote/neu', lazy: page(() => import('@/features/quotations/QuotationEditorPage')) },
              { path: 'angebote/:id', lazy: page(() => import('@/features/quotations/QuotationDetailPage')) },
              { path: 'angebote/:id/bearbeiten', lazy: page(() => import('@/features/quotations/QuotationEditorPage')) },
              { path: 'angebote/:id/vorschau', lazy: page(() => import('@/features/quotations/QuotationPreviewPage')) },
              { path: 'angebote/:id/pdf', lazy: page(() => import('@/features/quotations/QuotationPdfPage')) },
              { path: 'kunden', lazy: page(() => import('@/features/customers/CustomerListPage')) },
              { path: 'kunden/neu', lazy: page(() => import('@/features/customers/CustomerEditPage')) },
              { path: 'kunden/:id', lazy: page(() => import('@/features/customers/CustomerDetailPage')) },
              { path: 'kunden/:id/bearbeiten', lazy: page(() => import('@/features/customers/CustomerEditPage')) },
              { path: 'auftraege', lazy: page(() => import('@/features/jobs/JobListPage')) },
              { path: 'auftraege/:id', lazy: page(() => import('@/features/jobs/JobDetailPage')) },
              { path: 'rechnungen', lazy: page(() => import('@/features/invoices/InvoiceListPage')) },
              { path: 'rechnungen/neu', lazy: page(() => import('@/features/invoices/InvoiceEditorPage')) },
              { path: 'rechnungen/:id', lazy: page(() => import('@/features/invoices/InvoiceDetailPage')) },
              { path: 'rechnungen/:id/bearbeiten', lazy: page(() => import('@/features/invoices/InvoiceEditorPage')) },
              { path: 'rechnungen/:id/pdf', lazy: page(() => import('@/features/invoices/InvoicePdfPage')) },
              { path: 'vorlagen', lazy: page(() => import('@/features/templates/TemplateListPage')) },
              { path: 'vorlagen/neu', lazy: page(() => import('@/features/templates/TemplateEditorPage')) },
              { path: 'vorlagen/:id', lazy: page(() => import('@/features/templates/TemplateEditorPage')) },
              { path: 'team', lazy: page(() => import('@/features/team/TeamPage')) },
              { path: 'benachrichtigungen', lazy: page(() => import('@/features/notifications/NotificationsPage')) },
              {
                path: 'einstellungen',
                lazy: page(() => import('@/features/settings/SettingsLayout')),
                children: [
                  { index: true, element: <Navigate to="firma" replace /> },
                  { path: 'firma', lazy: page(() => import('@/features/settings/CompanySettingsPage')) },
                  { path: 'dokumente', lazy: page(() => import('@/features/settings/DocumentSettingsPage')) },
                  { path: 'benachrichtigungen', lazy: page(() => import('@/features/settings/NotificationSettingsPage')) },
                  { path: 'abo', lazy: page(() => import('@/features/settings/SubscriptionPage')) },
                  { path: 'konto', lazy: page(() => import('@/features/settings/AccountPage')) },
                ],
              },
            ],
          },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createHashRouter(routes);
}
