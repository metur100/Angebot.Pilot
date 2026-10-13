// All MSW request handlers of the mock backend. Used by the dev mock mode (browser.ts) and the unit tests (msw/node).
import type { HttpHandler } from 'msw';
import { authHandlers } from './routes/auth';
import { companyHandlers } from './routes/companies';
import { customerHandlers } from './routes/customers';
import { quotationHandlers } from './routes/quotations';
import { restHandlers } from './routes/rest';

export const handlers: HttpHandler[] = [...authHandlers, ...companyHandlers, ...customerHandlers, ...quotationHandlers, ...restHandlers];
