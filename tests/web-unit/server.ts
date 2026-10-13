import { setupServer } from 'msw/node';
import { handlers } from '@/mocks/handlers';

/** MSW server shared by all unit tests (see setup.ts). Tests may add overrides with server.use(...). */
export const server = setupServer(...handlers);
