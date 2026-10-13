import type { MembershipDto, MembershipRole } from '@angebotpilot/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { api } from '@/lib/api';
import { setDisplayTimeZone } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { permissionsFor, type Permissions } from '@/lib/roles';
import { useUser } from './auth';

export const COMPANY_KEY = 'ap.companyId';

function readStoredCompany(): string | null {
  try {
    return window.localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

interface CompanyContextValue {
  companyId: string;
  membership: MembershipDto;
  role: MembershipRole;
  can: Permissions;
  memberships: MembershipDto[];
  switchCompany: (companyId: string) => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

/** Resolves the selected company (persisted in localStorage). Users without a company go to onboarding. */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const [selectedId, setSelectedId] = useState<string | null>(readStoredCompany);
  const membership = user.companies.find((m) => m.companyId === selectedId) ?? user.companies[0];

  const switchCompany = useCallback((companyId: string) => {
    try {
      window.localStorage.setItem(COMPANY_KEY, companyId);
    } catch {
      // storage unavailable – selection lasts for this tab only
    }
    setSelectedId(companyId);
  }, []);

  // Persist the effective selection (e.g. the first company when nothing valid was stored).
  useEffect(() => {
    if (!membership || membership.companyId === selectedId) return;
    try {
      window.localStorage.setItem(COMPANY_KEY, membership.companyId);
    } catch {
      // storage unavailable
    }
  }, [membership, selectedId]);

  const value = useMemo<CompanyContextValue | null>(
    () =>
      membership
        ? {
            companyId: membership.companyId,
            membership,
            role: membership.role,
            can: permissionsFor(membership.role),
            memberships: user.companies,
            switchCompany,
          }
        : null,
    [membership, user.companies, switchCompany],
  );

  if (!value) return <Navigate to="/onboarding" replace />;
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used inside <CompanyProvider>');
  return context;
}

/** Company master data (also sets the display time zone). */
export function useCompanyDetails() {
  const { companyId } = useCompany();
  const query = useQuery({ queryKey: qk.company(companyId), queryFn: () => api.companies.get(companyId), staleTime: 5 * 60_000 });
  useEffect(() => {
    setDisplayTimeZone(query.data?.timeZone);
  }, [query.data?.timeZone]);
  return query;
}

export function useCompanySettings() {
  const { companyId } = useCompany();
  return useQuery({ queryKey: qk.settings(companyId), queryFn: () => api.companies.getSettings(companyId), staleTime: 5 * 60_000 });
}

export function useTaxRates() {
  const { companyId } = useCompany();
  return useQuery({ queryKey: qk.taxRates(companyId), queryFn: () => api.companies.taxRates(companyId), staleTime: 5 * 60_000 });
}

export function useMembers(enabled = true) {
  const { companyId } = useCompany();
  return useQuery({ queryKey: qk.members(companyId), queryFn: () => api.companies.members(companyId), staleTime: 60_000, enabled });
}
