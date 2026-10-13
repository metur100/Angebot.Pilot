// In-memory database of the mock backend (MSW). In the browser (not under Vitest) the whole database is persisted
// to localStorage after every request, so dev reloads keep their state. `resetMockDb()` restores the seed.
import { IS_TEST } from './domain';
import { emptyDb, SCHEMA_VERSION, type MockDb } from './model';
import { seedDemo, seedEmpty } from './seed';

export type MockScenario = 'seeded' | 'empty';

export {
  DEMO_ACCEPTED_TOKEN,
  DEMO_IDS,
  DEMO_INVITE_TOKEN,
  DEMO_PUBLIC_TOKEN,
  DEMO_TEAM_PASSWORD,
  DEMO_USER,
  DEMO_USERS,
} from './seed';
export type { MockDb } from './model';

export const STORAGE_KEY = 'ap.mockdb';

export function createMockDb(options: { scenario?: MockScenario } = {}): MockDb {
  const db = emptyDb();
  if ((options.scenario ?? 'seeded') === 'empty') {
    seedEmpty(db);
  } else {
    seedDemo(db);
  }
  return db;
}

function storage(): Storage | null {
  if (IS_TEST || typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function loadPersisted(): MockDb | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MockDb> | null;
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return null;
    // Fill collections added later so old snapshots keep working.
    return { ...emptyDb(), ...parsed };
  } catch {
    return null;
  }
}

/** The database used by the MSW handlers. */
export const db: MockDb = loadPersisted() ?? createMockDb();

/** Saves the database (browser dev mode only). */
export function persistMockDb(): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Quota exceeded or storage blocked – the mock keeps working in memory.
  }
}

/** Restores the seed data (or the empty onboarding scenario) and clears the persisted snapshot. */
export function resetMockDb(scenario: MockScenario = 'seeded'): void {
  const fresh = createMockDb({ scenario });
  Object.assign(db, fresh);
  const store = storage();
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
