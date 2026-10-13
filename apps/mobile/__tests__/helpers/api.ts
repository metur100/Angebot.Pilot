// Minimal fetch mock for the shared API client: route table keyed by "METHOD /path" (path without /api/v1 and query).

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

export type MockReply = { status?: number; body?: unknown } | Error;
export type Handler = (req: MockRequest) => MockReply | Promise<MockReply>;

export const BASE = 'https://api.test/api/v1';

function response(status: number, body: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => JSON.parse(text),
    text: async () => text,
    blob: async () => ({ size: text.length }),
  };
}

export interface ApiMock {
  calls: MockRequest[];
  on: (key: string, handler: Handler | MockReply) => void;
  callsTo: (key: string) => MockRequest[];
}

/** Installs a fetch mock. Unknown routes answer 404 so missing mocks show up as visible errors. */
export function mockApi(routes: Record<string, Handler | MockReply> = {}): ApiMock {
  const table = new Map(Object.entries(routes));
  const calls: MockRequest[] = [];
  const fetchMock = jest.fn(async (input: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    const req: MockRequest = {
      method, path, query: url.searchParams, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers ?? {},
    };
    calls.push(req);
    const key = `${method} ${path}`;
    let handler = table.get(key);
    if (!handler) {
      for (const [pattern, h] of table) {
        const [m, p] = pattern.split(' ');
        if (m === method && p && new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`).test(path)) {
          handler = h;
          break;
        }
      }
    }
    if (!handler) return response(404, { status: 404, title: 'Not Found', detail: `Kein Mock für ${key}` });
    const reply = typeof handler === 'function' ? await handler(req) : handler;
    if (reply instanceof Error) throw reply;
    return response(reply.status ?? 200, reply.body);
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  return {
    calls,
    on: (key, handler) => {
      table.set(key, handler);
    },
    callsTo: (key) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}
