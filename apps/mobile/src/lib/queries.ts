import type {
  CustomerListQuery, JobListQuery, JobStatus, PagedResult, QuotationListQuery, QuotationStatus,
} from '@angebotpilot/api-contracts';
import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';

import { api, useCompanyId } from './session';

export const PAGE_SIZE = 20;

export const keys = {
  all: (companyId: string) => ['c', companyId] as const,
  dashboard: (companyId: string) => ['c', companyId, 'dashboard'] as const,
  company: (companyId: string) => ['c', companyId, 'company'] as const,
  settings: (companyId: string) => ['c', companyId, 'settings'] as const,
  taxRates: (companyId: string) => ['c', companyId, 'taxRates'] as const,
  customers: (companyId: string) => ['c', companyId, 'customers'] as const,
  customerList: (companyId: string, q: CustomerListQuery) => ['c', companyId, 'customers', 'list', q] as const,
  customer: (companyId: string, id: string) => ['c', companyId, 'customers', 'detail', id] as const,
  customerQuotations: (companyId: string, id: string) => ['c', companyId, 'customers', 'detail', id, 'quotations'] as const,
  customerJobs: (companyId: string, id: string) => ['c', companyId, 'customers', 'detail', id, 'jobs'] as const,
  quotations: (companyId: string) => ['c', companyId, 'quotations'] as const,
  quotationList: (companyId: string, q: QuotationListQuery) => ['c', companyId, 'quotations', 'list', q] as const,
  quotation: (companyId: string, id: string) => ['c', companyId, 'quotations', 'detail', id] as const,
  quotationEvents: (companyId: string, id: string) => ['c', companyId, 'quotations', 'detail', id, 'events'] as const,
  quotationDeliveries: (companyId: string, id: string) => ['c', companyId, 'quotations', 'detail', id, 'deliveries'] as const,
  quotationFollowUps: (companyId: string, id: string) => ['c', companyId, 'quotations', 'detail', id, 'followUps'] as const,
  jobs: (companyId: string) => ['c', companyId, 'jobs'] as const,
  jobList: (companyId: string, q: JobListQuery) => ['c', companyId, 'jobs', 'list', q] as const,
  job: (companyId: string, id: string) => ['c', companyId, 'jobs', 'detail', id] as const,
  templates: (companyId: string) => ['c', companyId, 'templates'] as const,
  template: (companyId: string, id: string) => ['c', companyId, 'templates', id] as const,
  notifications: (companyId: string) => ['c', companyId, 'notifications'] as const,
  unread: (companyId: string) => ['c', companyId, 'notifications', 'unread'] as const,
  publicQuotation: (token: string) => ['public', token] as const,
};

function nextPage<T>(last: PagedResult<T>): number | undefined {
  return last.page * last.pageSize < last.totalCount ? last.page + 1 : undefined;
}

export function flattenPages<T>(data: InfiniteData<PagedResult<T>> | undefined): T[] {
  return data?.pages.flatMap((p) => p.items) ?? [];
}

export function useDashboard() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.dashboard(companyId), queryFn: () => api.companies.dashboard(companyId), enabled: !!companyId });
}

export function useCompany() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.company(companyId), queryFn: () => api.companies.get(companyId), enabled: !!companyId });
}

export function useCompanySettings() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.settings(companyId), queryFn: () => api.companies.getSettings(companyId), enabled: !!companyId });
}

export function useTaxRates() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.taxRates(companyId), queryFn: () => api.companies.taxRates(companyId), enabled: !!companyId, staleTime: 5 * 60_000 });
}

export function useCustomerList(query: Omit<CustomerListQuery, 'page' | 'pageSize'>) {
  const companyId = useCompanyId();
  return useInfiniteQuery({
    queryKey: keys.customerList(companyId, query),
    queryFn: ({ pageParam }) => api.customers.list(companyId, { ...query, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: !!companyId,
  });
}

export function useCustomer(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.customer(companyId, id ?? ''), queryFn: () => api.customers.get(companyId, id!), enabled: !!companyId && !!id });
}

export function useCustomerQuotations(id: string) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.customerQuotations(companyId, id), queryFn: () => api.customers.quotations(companyId, id), enabled: !!id });
}

export function useCustomerJobs(id: string) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.customerJobs(companyId, id), queryFn: () => api.customers.jobs(companyId, id), enabled: !!id });
}

export function useQuotationList(query: { search?: string; status?: QuotationStatus[]; customerId?: string }) {
  const companyId = useCompanyId();
  const q: QuotationListQuery = { ...query, sort: '-updatedAt' };
  return useInfiniteQuery({
    queryKey: keys.quotationList(companyId, q),
    queryFn: ({ pageParam }) => api.quotations.list(companyId, { ...q, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: !!companyId,
  });
}

export function useQuotation(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.quotation(companyId, id ?? ''), queryFn: () => api.quotations.get(companyId, id!), enabled: !!companyId && !!id });
}

export function useQuotationEvents(id: string) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.quotationEvents(companyId, id), queryFn: () => api.quotations.events(companyId, id) });
}

export function useQuotationDeliveries(id: string) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.quotationDeliveries(companyId, id), queryFn: () => api.quotations.deliveries(companyId, id) });
}

export function useQuotationFollowUps(id: string) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.quotationFollowUps(companyId, id), queryFn: () => api.quotations.followUps(companyId, id) });
}

export function useJobList(query: { search?: string; status?: JobStatus[] }) {
  const companyId = useCompanyId();
  const q: JobListQuery = { ...query, sort: '-createdAt' };
  return useInfiniteQuery({
    queryKey: keys.jobList(companyId, q),
    queryFn: ({ pageParam }) => api.jobs.list(companyId, { ...q, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: !!companyId,
  });
}

export function useJob(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.job(companyId, id ?? ''), queryFn: () => api.jobs.get(companyId, id!), enabled: !!companyId && !!id });
}

export function useTemplates() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: keys.templates(companyId), queryFn: () => api.templates.list(companyId), enabled: !!companyId });
}

export function useNotifications() {
  const companyId = useCompanyId();
  return useInfiniteQuery({
    queryKey: keys.notifications(companyId),
    queryFn: ({ pageParam }) => api.notifications.list(companyId, { page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: !!companyId,
  });
}

export function useUnreadCount() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: keys.unread(companyId),
    queryFn: () => api.notifications.unreadCount(companyId),
    enabled: !!companyId,
    refetchInterval: 60_000,
  });
}
