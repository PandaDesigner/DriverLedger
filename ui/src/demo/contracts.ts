export const SCENARIO = {
  READY: 'ready', LOADING: 'loading', EMPTY: 'empty', ERROR: 'error',
  OFFLINE: 'offline', PENDING: 'pending', SUCCESS: 'success', INVALID: 'invalid',
  UNKNOWN: 'unknown', PARTIAL: 'partial', ACTIVE: 'active', GOAL: 'goal',
  CONFLICT: 'conflict', PERMISSION: 'permission',
} as const;
export type Scenario = typeof SCENARIO[keyof typeof SCENARIO];
export const PLATFORM = { UBER: 'Uber', DIDI: 'DiDi', INDRIVE: 'InDrive', ALL: 'Todas' } as const;
export type Platform = Exclude<typeof PLATFORM[keyof typeof PLATFORM], 'Todas'>;
export const KIND = { ALL: 'all', TRIP: 'trip', EXPENSE: 'expense' } as const;
export const RANGE = { TODAY: 'today', WEEK: 'week', MONTH: 'month', CUSTOM: 'custom' } as const;
export const THEME = { SYSTEM: 'system', LIGHT: 'light', DARK: 'dark' } as const;
export const SESSION = { LOGIN: 'login', ONBOARDING: 'onboarding', WORKSPACE: 'workspace' } as const;
export const CATEGORY = ['Gasolina', 'Alimentación', 'Parqueadero', 'Otros'] as const;
export const DEMO_DATE = '2026-10-12';
export type Theme = typeof THEME[keyof typeof THEME];
export type Activity = Readonly<{
  id: string; kind: typeof KIND.TRIP | typeof KIND.EXPENSE; amount: number;
  date: string; time: string; platform?: Platform; category?: string; note: string;
}>;
export type ExpenseDraft = Readonly<{ amount: string; category: string; date: string; note: string }>;
export type ValidExpense = Readonly<{ amount: number; category: string; date: string; note: string }>;
export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };
export type DemoState = Readonly<{
  session: typeof SESSION[keyof typeof SESSION]; scenario: Scenario; theme: Theme;
  platforms: readonly Platform[]; activity: readonly Activity[]; draft: ExpenseDraft;
  projectionAvailable: boolean; confirmed: readonly string[];
}>;
export type HistoryFilter = Readonly<{
  range: typeof RANGE[keyof typeof RANGE]; platform: Platform | typeof PLATFORM.ALL;
  kind: typeof KIND[keyof typeof KIND]; from: string; to: string;
}>;
export const ROUTE = {
  LOGIN: '/(auth)/login', REGISTER: '/(auth)/register', RECOVERY: '/(auth)/forgot-password',
  ONBOARDING: '/(onboarding)/platforms', DASHBOARD: '/(tabs)/dashboard',
  HISTORY: '/(tabs)/history', SETTINGS: '/(tabs)/settings',
  TRIP: '/modals/confirm-trip', EXPENSE: '/modals/add-expense',
} as const;
