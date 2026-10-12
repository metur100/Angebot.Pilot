import type * as T from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly problem: T.ApiProblem;

  constructor(problem: T.ApiProblem) {
    super(problem.detail ?? problem.title ?? `HTTP ${problem.status}`);
    this.name = 'ApiError';
    this.status = problem.status;
    this.problem = problem;
  }

  get code(): string | undefined {
    return this.problem.code;
  }

  /** Field errors keyed by camelCase path (e.g. "lineItems[0].quantity"). */
  get fieldErrors(): Record<string, string[]> {
    return this.problem.errors ?? {};
  }
}

/** Thrown when the device is offline or the server cannot be reached. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export interface ApiClientOptions {
  /** Origin of the API, without /api/v1. Use '' for same-origin (web behind the Pages proxy / Vite dev proxy). */
  baseUrl: string;
  client: 'web' | 'mobile';
  getAccessToken: () => string | null;
  /** Obtains a new access token (web: cookie-based, mobile: stored refresh token). Returns null when the session ended. */
  refreshAccessToken: () => Promise<string | null>;
  /** Called when a request is unauthorised even after a refresh attempt. */
  onSessionExpired?: () => void;
  /**
   * 'include' only when the API and web app share a site and the refresh token travels in an HttpOnly cookie
   * (Auth:WebRefreshTransport=Cookie). Default 'omit': the refresh token is sent in the request body.
   */
  credentials?: RequestCredentials;
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

function toQueryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const api = `${options.baseUrl.replace(/\/$/, '')}/api/v1`;

  const url = (path: string, query?: Query) => `${api}${path}${toQueryString(query)}`;

  function headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'X-AngebotPilot-Client': options.client, Accept: 'application/json', ...extra };
    const token = options.getAccessToken();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async function raw(method: string, path: string, init: { query?: Query; body?: unknown; form?: FormData; auth?: boolean } = {}): Promise<Response> {
    const doFetch = () => {
      const isJson = init.body !== undefined;
      return fetchImpl(url(path, init.query), {
        method,
        headers: headers(isJson ? { 'Content-Type': 'application/json' } : undefined),
        body: init.form ?? (isJson ? JSON.stringify(init.body) : undefined),
        credentials: options.credentials ?? 'omit',
      });
    };

    let response: Response;
    try {
      response = await doFetch();
    } catch (error) {
      throw new NetworkError(error);
    }

    if (response.status === 401 && init.auth !== false) {
      const token = await options.refreshAccessToken().catch(() => null);
      if (token) {
        try {
          response = await doFetch();
        } catch (error) {
          throw new NetworkError(error);
        }
      }
      if (response.status === 401) options.onSessionExpired?.();
    }

    if (!response.ok) {
      let problem: T.ApiProblem = { status: response.status, title: response.statusText };
      try {
        const body = (await response.json()) as Partial<T.ApiProblem>;
        problem = { ...problem, ...body, status: response.status };
      } catch {
        // non-JSON error body
      }
      throw new ApiError(problem);
    }
    return response;
  }

  async function json<R>(method: string, path: string, init?: { query?: Query; body?: unknown; form?: FormData; auth?: boolean }): Promise<R> {
    const response = await raw(method, path, init);
    if (response.status === 204 || response.status === 202) return undefined as R;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as R;
  }

  const get = <R>(path: string, query?: Query) => json<R>('GET', path, { query });
  const post = <R>(path: string, body?: unknown, auth = true) => json<R>('POST', path, { body: body ?? {}, auth });
  const put = <R>(path: string, body: unknown) => json<R>('PUT', path, { body });
  const patch = <R>(path: string, body: unknown) => json<R>('PATCH', path, { body });
  const del = <R = void>(path: string) => json<R>('DELETE', path);
  const blob = async (path: string, query?: Query) => (await raw('GET', path, { query })).blob();
  const c = (companyId: string) => `/companies/${encodeURIComponent(companyId)}`;

  return {
    /** Absolute URL of an API path (e.g. for downloads with expo-file-system). */
    url,
    /** Headers including the current bearer token. */
    authHeaders: () => headers(),
    raw,

    auth: {
      register: (body: T.RegisterRequest) => post<T.AuthResponse>('/auth/register', body, false),
      login: (body: T.LoginRequest) => post<T.AuthResponse>('/auth/login', body, false),
      /** Pass the stored refresh token (body transport), or nothing when the API uses the HttpOnly cookie transport. */
      refresh: (body: T.RefreshRequest = {}) => post<T.AuthResponse>('/auth/refresh', body, false),
      logout: (body: T.LogoutRequest = {}) => post<void>('/auth/logout', body, false),
      forgotPassword: (body: T.ForgotPasswordRequest) => post<void>('/auth/forgot-password', body, false),
      resetPassword: (body: T.ResetPasswordRequest) => post<void>('/auth/reset-password', body, false),
      verifyEmail: (body: T.VerifyEmailRequest) => post<void>('/auth/verify-email', body, false),
      resendVerification: () => post<void>('/auth/resend-verification'),
    },

    me: {
      get: () => get<T.MeDto>('/me'),
      update: (body: T.UpdateProfileRequest) => patch<T.MeDto>('/me', body),
      changePassword: (body: T.ChangePasswordRequest) => post<void>('/me/change-password', body),
      /** GDPR export of the user's own data (JSON). */
      export: () => blob('/me/export'),
      /** Deletes the account. Fails with code "sole_owner" while the user is the only owner of a company with other members. */
      delete: (body: T.DeleteAccountRequest) => post<void>('/me/delete', body),
    },

    invitations: {
      preview: (token: string) => get<T.InvitationPreviewDto>(`/invitations/${encodeURIComponent(token)}`),
      accept: (body: T.AcceptInvitationRequest) => post<T.MeDto>('/invitations/accept', body),
    },

    companies: {
      create: (body: T.CreateCompanyRequest) => post<T.CompanyDto>('/companies', body),
      get: (companyId: string) => get<T.CompanyDto>(c(companyId)),
      update: (companyId: string, body: T.UpdateCompanyRequest) => put<T.CompanyDto>(c(companyId), body),
      delete: (companyId: string, body: T.DeleteCompanyRequest) => post<void>(`${c(companyId)}/delete`, body),
      export: (companyId: string) => blob(`${c(companyId)}/export`),
      getSettings: (companyId: string) => get<T.CompanySettingsDto>(`${c(companyId)}/settings`),
      updateSettings: (companyId: string, body: T.CompanySettingsDto) => put<T.CompanySettingsDto>(`${c(companyId)}/settings`, body),
      uploadLogo: (companyId: string, file: FormData) => json<T.CompanyDto>('PUT', `${c(companyId)}/logo`, { form: file }),
      logoUrl: (companyId: string) => url(`${c(companyId)}/logo`),
      getLogo: (companyId: string) => blob(`${c(companyId)}/logo`),
      deleteLogo: (companyId: string) => del<T.CompanyDto>(`${c(companyId)}/logo`),
      taxRates: (companyId: string) => get<T.TaxRateDto[]>(`${c(companyId)}/tax-rates`),
      createTaxRate: (companyId: string, body: T.UpsertTaxRateRequest) => post<T.TaxRateDto>(`${c(companyId)}/tax-rates`, body),
      updateTaxRate: (companyId: string, id: string, body: T.UpsertTaxRateRequest) => put<T.TaxRateDto>(`${c(companyId)}/tax-rates/${id}`, body),
      members: (companyId: string) => get<T.MemberDto[]>(`${c(companyId)}/members`),
      updateMember: (companyId: string, membershipId: string, body: T.UpdateMemberRequest) => patch<T.MemberDto>(`${c(companyId)}/members/${membershipId}`, body),
      deactivateMember: (companyId: string, membershipId: string) => post<T.MemberDto>(`${c(companyId)}/members/${membershipId}/deactivate`),
      reactivateMember: (companyId: string, membershipId: string) => post<T.MemberDto>(`${c(companyId)}/members/${membershipId}/reactivate`),
      invitations: (companyId: string) => get<T.InvitationDto[]>(`${c(companyId)}/invitations`),
      invite: (companyId: string, body: T.CreateInvitationRequest) => post<T.InvitationDto>(`${c(companyId)}/invitations`, body),
      revokeInvitation: (companyId: string, id: string) => del(`${c(companyId)}/invitations/${id}`),
      subscription: (companyId: string) => get<T.SubscriptionDto>(`${c(companyId)}/subscription`),
      changePlan: (companyId: string, body: T.ChangePlanRequest) => post<T.ChangePlanResponse>(`${c(companyId)}/subscription/change-plan`, body),
      dashboard: (companyId: string, query: { from?: string; to?: string } = {}) => get<T.DashboardDto>(`${c(companyId)}/dashboard`, query),
      activity: (companyId: string, query: { page?: number; pageSize?: number } = {}) => get<T.PagedResult<T.ActivityDto>>(`${c(companyId)}/activity`, query),
    },

    customers: {
      list: (companyId: string, query: T.CustomerListQuery = {}) => get<T.PagedResult<T.CustomerListItemDto>>(`${c(companyId)}/customers`, query as Query),
      get: (companyId: string, id: string) => get<T.CustomerDto>(`${c(companyId)}/customers/${id}`),
      create: (companyId: string, body: T.UpsertCustomerRequest) => post<T.CustomerDto>(`${c(companyId)}/customers`, body),
      update: (companyId: string, id: string, body: T.UpsertCustomerRequest) => put<T.CustomerDto>(`${c(companyId)}/customers/${id}`, body),
      archive: (companyId: string, id: string) => post<T.CustomerDto>(`${c(companyId)}/customers/${id}/archive`),
      unarchive: (companyId: string, id: string) => post<T.CustomerDto>(`${c(companyId)}/customers/${id}/unarchive`),
      /** Deletes a customer without documents; customers with quotations/jobs are anonymised instead (retention). */
      delete: (companyId: string, id: string) => del<T.DeleteCustomerResponse>(`${c(companyId)}/customers/${id}`),
      quotations: (companyId: string, id: string) => get<T.QuotationListItemDto[]>(`${c(companyId)}/customers/${id}/quotations`),
      jobs: (companyId: string, id: string) => get<T.JobListItemDto[]>(`${c(companyId)}/customers/${id}/jobs`),
      exportCsv: (companyId: string) => blob(`${c(companyId)}/customers/export.csv`),
    },

    quotations: {
      list: (companyId: string, query: T.QuotationListQuery = {}) => get<T.PagedResult<T.QuotationListItemDto>>(`${c(companyId)}/quotations`, query as Query),
      get: (companyId: string, id: string) => get<T.QuotationDto>(`${c(companyId)}/quotations/${id}`),
      create: (companyId: string, body: T.CreateQuotationRequest) => post<T.QuotationDto>(`${c(companyId)}/quotations`, body),
      update: (companyId: string, id: string, body: T.UpdateQuotationRequest) => put<T.QuotationDto>(`${c(companyId)}/quotations/${id}`, body),
      /** Drafts only. The number is never reused. */
      delete: (companyId: string, id: string) => del(`${c(companyId)}/quotations/${id}`),
      duplicate: (companyId: string, id: string) => post<T.QuotationDto>(`${c(companyId)}/quotations/${id}/duplicate`),
      revise: (companyId: string, id: string) => post<T.QuotationDto>(`${c(companyId)}/quotations/${id}/revise`),
      send: (companyId: string, id: string, body: T.SendQuotationRequest) => post<T.SendQuotationResponse>(`${c(companyId)}/quotations/${id}/send`, body),
      accept: (companyId: string, id: string, body: T.DecisionRequest = {}) => post<T.QuotationDto>(`${c(companyId)}/quotations/${id}/accept`, body),
      reject: (companyId: string, id: string, body: T.DecisionRequest = {}) => post<T.QuotationDto>(`${c(companyId)}/quotations/${id}/reject`, body),
      cancel: (companyId: string, id: string, body: T.CancelRequest = {}) => post<T.QuotationDto>(`${c(companyId)}/quotations/${id}/cancel`, body),
      pdfUrl: (companyId: string, id: string) => url(`${c(companyId)}/quotations/${id}/pdf`),
      pdf: (companyId: string, id: string) => blob(`${c(companyId)}/quotations/${id}/pdf`),
      events: (companyId: string, id: string) => get<T.QuotationEventDto[]>(`${c(companyId)}/quotations/${id}/events`),
      deliveries: (companyId: string, id: string) => get<T.EmailDeliveryDto[]>(`${c(companyId)}/quotations/${id}/deliveries`),
      followUps: (companyId: string, id: string) => get<T.FollowUpDto[]>(`${c(companyId)}/quotations/${id}/follow-ups`),
      cancelFollowUps: (companyId: string, id: string) => post<void>(`${c(companyId)}/quotations/${id}/follow-ups/cancel`),
      /** Creates a new public link (revoking the previous one). The URL is only returned once. */
      createPublicLink: (companyId: string, id: string) => post<T.PublicLinkResponse>(`${c(companyId)}/quotations/${id}/public-link`),
      revokePublicLink: (companyId: string, id: string) => del(`${c(companyId)}/quotations/${id}/public-link`),
      convertToJob: (companyId: string, id: string, body: T.ConvertToJobRequest = {}) => post<T.JobDto>(`${c(companyId)}/quotations/${id}/convert-to-job`, body),
      saveAsTemplate: (companyId: string, id: string, body: T.SaveAsTemplateRequest) => post<T.TemplateDto>(`${c(companyId)}/quotations/${id}/save-as-template`, body),
      calculate: (companyId: string, body: T.CalculateRequest) => post<T.TotalsDto>(`${c(companyId)}/quotations/calculate`, body),
      /** Resolves a scanned public-link token to a quotation of the current company (404 otherwise). */
      lookupByToken: (companyId: string, body: T.LookupByTokenRequest) => post<T.LookupByTokenResponse>(`${c(companyId)}/quotations/lookup-by-token`, body),
      exportCsv: (companyId: string, query: T.QuotationListQuery = {}) => blob(`${c(companyId)}/quotations/export.csv`, query as Query),
    },

    templates: {
      list: (companyId: string) => get<T.TemplateListItemDto[]>(`${c(companyId)}/templates`),
      get: (companyId: string, id: string) => get<T.TemplateDto>(`${c(companyId)}/templates/${id}`),
      create: (companyId: string, body: T.UpsertTemplateRequest) => post<T.TemplateDto>(`${c(companyId)}/templates`, body),
      update: (companyId: string, id: string, body: T.UpsertTemplateRequest) => put<T.TemplateDto>(`${c(companyId)}/templates/${id}`, body),
      delete: (companyId: string, id: string) => del(`${c(companyId)}/templates/${id}`),
    },

    jobs: {
      list: (companyId: string, query: T.JobListQuery = {}) => get<T.PagedResult<T.JobListItemDto>>(`${c(companyId)}/jobs`, query as Query),
      get: (companyId: string, id: string) => get<T.JobDto>(`${c(companyId)}/jobs/${id}`),
      update: (companyId: string, id: string, body: T.UpdateJobRequest) => put<T.JobDto>(`${c(companyId)}/jobs/${id}`, body),
      changeStatus: (companyId: string, id: string, body: T.ChangeJobStatusRequest) => post<T.JobDto>(`${c(companyId)}/jobs/${id}/status`, body),
      exportCsv: (companyId: string) => blob(`${c(companyId)}/jobs/export.csv`),
    },

    notifications: {
      list: (companyId: string, query: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}) =>
        get<T.PagedResult<T.NotificationDto>>(`${c(companyId)}/notifications`, query),
      unreadCount: (companyId: string) => get<{ count: number }>(`${c(companyId)}/notifications/unread-count`),
      markRead: (companyId: string, id: string) => post<void>(`${c(companyId)}/notifications/${id}/read`),
      markAllRead: (companyId: string) => post<void>(`${c(companyId)}/notifications/read-all`),
    },

    /** Unauthenticated customer endpoints. The token comes from the public link. */
    publicQuotation: {
      get: (token: string) => json<T.PublicQuotationDto>('GET', `/public/quotations/${encodeURIComponent(token)}`, { auth: false }),
      pdfUrl: (token: string) => url(`/public/quotations/${encodeURIComponent(token)}/pdf`),
      logoUrl: (token: string) => url(`/public/quotations/${encodeURIComponent(token)}/logo`),
      accept: (token: string, body: T.PublicAcceptRequest) => post<T.PublicDecisionResponse>(`/public/quotations/${encodeURIComponent(token)}/accept`, body, false),
      reject: (token: string, body: T.PublicRejectRequest) => post<T.PublicDecisionResponse>(`/public/quotations/${encodeURIComponent(token)}/reject`, body, false),
      optOut: (token: string) => post<void>(`/public/quotations/${encodeURIComponent(token)}/opt-out`, {}, false),
    },

    /** Only available when the API runs in Development/Testing with the capture email sink. */
    dev: {
      emails: (to?: string) => json<T.DevEmailDto[]>('GET', '/dev/emails', { query: { to }, auth: false }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Extracts the token from a public quotation URL (https://…/q/<token>) or returns the input if it already is a token. */
export function extractPublicToken(input: string): string | null {
  const trimmed = input.trim();
  const match = /\/q\/([A-Za-z0-9_-]{20,})/.exec(trimmed);
  if (match) return match[1] ?? null;
  return /^[A-Za-z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}

/** German, user-facing message for any error thrown by the client. */
export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === 'concurrency_conflict') {
      return 'Der Datensatz wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.';
    }
    if (error.status === 403) return error.problem.detail ?? 'Für diese Aktion fehlt Ihnen die Berechtigung.';
    if (error.status === 404) return error.problem.detail ?? 'Der Eintrag wurde nicht gefunden.';
    if (error.status === 429) return 'Zu viele Anfragen. Bitte warten Sie einen Moment.';
    if (error.status >= 500) return 'Ein Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
    return error.problem.detail ?? error.problem.title ?? 'Die Anfrage ist fehlgeschlagen.';
  }
  return 'Ein unerwarteter Fehler ist aufgetreten.';
}
