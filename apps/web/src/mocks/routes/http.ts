// Shared plumbing of the mock routes: route wrappers (auth, company membership, roles), problem responses,
// request parsing, paging and CSV output.
import type { ApiProblem, MembershipRole, PagedResult } from '@angebotpilot/api-contracts';
import { delay, http, HttpResponse, type DefaultBodyType, type HttpHandler, type PathParams } from 'msw';
import { db, persistMockDb } from '../db';
import { IS_TEST } from '../domain';
import type { CompanyRec, MembershipRec, UserRec } from '../model';

// ---------- problems ----------

export class Problem extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.detail ?? problem.title ?? `HTTP ${problem.status}`);
  }
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  500: 'Internal Server Error',
};

export function problem(status: number, code: string, detail: string, errors?: Record<string, string[]>): Problem {
  return new Problem({ type: `https://httpstatuses.io/${status}`, status, title: TITLES[status] ?? 'Error', detail, code, ...(errors ? { errors } : {}) });
}

export const badRequest = (code: string, detail: string, errors?: Record<string, string[]>) => problem(400, code, detail, errors);
export const unauthorized = (code = 'unauthorized', detail = 'Bitte melden Sie sich an.') => problem(401, code, detail);
export const forbidden = () => problem(403, 'forbidden', 'Für diese Aktion fehlt Ihnen die Berechtigung.');
export const notFound = (detail = 'Der Eintrag wurde nicht gefunden.', code = 'not_found') => problem(404, code, detail);
export const conflict = (code: string, detail: string) => problem(409, code, detail);
export const paymentRequired = (code: string, detail: string) => problem(402, code, detail);
export const concurrencyConflict = () =>
  conflict('concurrency_conflict', 'Der Datensatz wurde zwischenzeitlich von jemand anderem geändert. Bitte laden Sie die Seite neu.');

/** Collects field errors (camelCase paths) and throws a 400 validation problem. */
export class FieldErrors {
  readonly errors: Record<string, string[]> = {};

  add(field: string, message: string): void {
    (this.errors[field] ??= []).push(message);
  }

  get any(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  throwIfAny(): void {
    if (this.any) throw badRequest('validation_failed', 'Bitte prüfen Sie Ihre Eingaben.', this.errors);
  }
}

export function validation(field: string, message: string): Problem {
  return badRequest('validation_failed', message, { [field]: [message] });
}

export function problemResponse(p: ApiProblem): Response {
  return new HttpResponse(JSON.stringify(p), { status: p.status, headers: { 'Content-Type': 'application/problem+json' } });
}

// ---------- responses ----------

export const json = (data: unknown, status = 200): Response => HttpResponse.json(data as DefaultBodyType, { status });
export const noContent = (): Response => new HttpResponse(null, { status: 204 });
export const acceptedEmpty = (): Response => new HttpResponse(null, { status: 202 });

export function fileResponse(body: BodyInit, contentType: string, fileName?: string, inline = false): Response {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (fileName) headers['Content-Disposition'] = `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`;
  return new HttpResponse(body, { status: 200, headers });
}

// ---------- request context ----------

export interface Ctx {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
}

export interface AuthCtx extends Ctx {
  user: UserRec;
}

export interface CompanyCtx extends AuthCtx {
  company: CompanyRec;
  membership: MembershipRec;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Handler<C> = (ctx: C) => Response | Promise<Response>;

export const API = '*/api/v1';

function normaliseParams(params: PathParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = decodeURIComponent(value);
    else if (Array.isArray(value) && typeof value[0] === 'string') out[key] = decodeURIComponent(value[0]);
  }
  return out;
}

/** Unauthenticated route. Errors thrown as {@link Problem} become problem+json responses. */
export function route(method: Method, path: string, fn: Handler<Ctx>): HttpHandler {
  return http[method]<PathParams, DefaultBodyType, undefined>(`${API}${path}`, async ({ request, params }) => {
    if (!IS_TEST) await delay(150);
    const ctx: Ctx = { request, params: normaliseParams(params), query: new URL(request.url).searchParams };
    try {
      return await fn(ctx);
    } catch (error) {
      if (error instanceof Problem) return problemResponse(error.problem);
      console.error('[mock api]', method.toUpperCase(), path, error);
      return problemResponse({ status: 500, title: 'Internal Server Error', detail: error instanceof Error ? error.message : String(error), code: 'mock_error' });
    } finally {
      persistMockDb();
    }
  });
}

/** Resolves the bearer token `mock-access.<userId>.<random>`. */
export function userFromRequest(request: Request): UserRec | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+mock-access\.([^.]+)\.\S+$/i.exec(header.trim());
  if (!match) return null;
  return db.users.find((u) => u.id === match[1]) ?? null;
}

export function requireUser(request: Request): UserRec {
  const user = userFromRequest(request);
  if (!user) throw unauthorized();
  return user;
}

export function authRoute(method: Method, path: string, fn: Handler<AuthCtx>): HttpHandler {
  return route(method, path, (ctx) => fn({ ...ctx, user: requireUser(ctx.request) }));
}

const RANK: Record<MembershipRole, number> = { Employee: 0, Admin: 1, Owner: 2 };

export function hasRole(role: MembershipRole, min: MembershipRole): boolean {
  return RANK[role] >= RANK[min];
}

export function requireRole(ctx: CompanyCtx, min: MembershipRole): void {
  if (!hasRole(ctx.membership.role, min)) throw forbidden();
}

/** Route under /companies/:companyId – the caller must be an active member (404 otherwise, so data never leaks). */
export function companyRoute(method: Method, path: string, fn: Handler<CompanyCtx>, minRole?: MembershipRole): HttpHandler {
  return authRoute(method, `/companies/:companyId${path}`, (ctx) => {
    const companyId = ctx.params.companyId ?? '';
    const company = db.companies.find((c) => c.id === companyId);
    const membership = db.memberships.find((m) => m.companyId === companyId && m.userId === ctx.user.id && m.status === 'Active');
    if (!company || !membership) throw notFound('Die Firma wurde nicht gefunden.');
    const companyCtx: CompanyCtx = { ...ctx, company, membership };
    if (minRole) requireRole(companyCtx, minRole);
    return fn(companyCtx);
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw badRequest('invalid_json', 'Der Anfrageinhalt ist kein gültiges JSON.');
  }
}

// ---------- strings, paging, sorting ----------

export function clean(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  return t === '' ? null : t;
}

export function includesCi(haystack: string | null | undefined, needle: string): boolean {
  return !!haystack && haystack.toLocaleLowerCase('de-DE').includes(needle.toLocaleLowerCase('de-DE'));
}

export function paginate<T>(items: T[], query: URLSearchParams, defaultPageSize = 20): PagedResult<T> {
  const page = Math.max(1, Math.floor(Number(query.get('page') ?? '1')) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.get('pageSize') ?? String(defaultPageSize))) || defaultPageSize));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, totalCount: items.length };
}

export function listParam(query: URLSearchParams, name: string): string[] {
  return query.getAll(name).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

type SortValue = string | number | null | undefined;

/** Sorts by `key` or `-key` (descending) using the given key selectors. */
export function sortBy<T>(items: T[], sort: string | null, selectors: Record<string, (item: T) => SortValue>, fallback: string): T[] {
  const requested = sort && selectors[sort.replace(/^-/, '')] ? sort : fallback;
  const desc = requested.startsWith('-');
  const select = selectors[requested.replace(/^-/, '')];
  if (!select) return items;
  return [...items].sort((a, b) => {
    const va = select(a);
    const vb = select(b);
    let cmp: number;
    if (va === vb) cmp = 0;
    else if (va === null || va === undefined) cmp = 1;
    else if (vb === null || vb === undefined) cmp = -1;
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), 'de-DE');
    return desc ? -cmp : cmp;
  });
}

// ---------- CSV (German Excel: BOM, semicolon, CRLF, formula-injection guard) ----------

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[;"\n\r,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvResponse(fileName: string, header: string[], rows: (string | null | undefined)[][]): Response {
  const lines = [header, ...rows].map((row) => row.map(csvEscape).join(';'));
  return fileResponse(`\uFEFF${lines.join('\r\n')}\r\n`, 'text/csv; charset=utf-8', fileName);
}

export const csvMoney = (value: number) => value.toFixed(2).replace('.', ',');
export const csvDate = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
export function csvDateTime(iso: string | null | undefined, timeZone = 'Europe/Berlin'): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('de-DE', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

/** Base64 helpers for storing binary uploads (logo) as JSON. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
