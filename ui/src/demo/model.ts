import {
  CATEGORY,
  DEMO_DATE,
  KIND,
  SCENARIO,
  SESSION,
  THEME,
  type Activity,
  type DemoState,
  type ExpenseDraft,
  type Platform,
  type Scenario,
  type ValidExpense,
  type Validation,
} from './contracts';
import { demoActivity } from './fixtures';
const emptyDraft: ExpenseDraft = { amount: '', category: CATEGORY[0], date: DEMO_DATE, note: '' };
export function createDemoState(): DemoState {
  return {
    session: SESSION.LOGIN,
    scenario: SCENARIO.READY,
    theme: THEME.SYSTEM,
    platforms: [],
    activity: demoActivity.map((entry) => ({ ...entry })),
    draft: { ...emptyDraft },
    projectionAvailable: true,
    confirmed: [],
    preferences: { target: '200000', notifications: false },
  };
}
export function enterDemo(state: DemoState): DemoState {
  return { ...state, session: SESSION.ONBOARDING };
}
export function selectPlatforms(state: DemoState, platforms: readonly Platform[]): DemoState {
  return { ...state, platforms: [...new Set(platforms)] };
}
export function openWorkspace(state: DemoState): DemoState {
  if (!state.platforms.length) {
    throw new Error('Selecciona al menos una plataforma para la demostración.');
  }
  return { ...state, session: SESSION.WORKSPACE, scenario: SCENARIO.READY };
}
export function changeScenario(state: DemoState, scenario: Scenario): DemoState {
  return { ...state, scenario };
}
export function updateDraft(state: DemoState, draft: ExpenseDraft): DemoState {
  return { ...state, draft: { ...draft } };
}
export function discardDraft(state: DemoState): DemoState {
  return { ...state, draft: { ...emptyDraft } };
}
export function addExpense(state: DemoState, expense: ValidExpense): DemoState {
  const activity: Activity = {
    ...expense,
    id: `demo-expense-${state.activity.length}`,
    kind: KIND.EXPENSE,
    time: '10:30',
  };
  return {
    ...discardDraft(state),
    activity: [...state.activity, activity],
    projectionAvailable: false,
    scenario:
      state.scenario === SCENARIO.OFFLINE || state.scenario === SCENARIO.PENDING
        ? SCENARIO.PENDING
        : SCENARIO.SUCCESS,
  };
}
export function confirmTrip(state: DemoState, trip: Activity): DemoState {
  if (state.confirmed.includes(trip.id)) {
    return state;
  }
  return {
    ...state,
    activity: [...state.activity, { ...trip }],
    confirmed: [...state.confirmed, trip.id],
    projectionAvailable: false,
    scenario: SCENARIO.SUCCESS,
  };
}
export function nextTripId(state: DemoState): string {
  return `demo-manual-trip-${state.confirmed.length + 1}`;
}
export function visibleActivity(state: DemoState): readonly Activity[] {
  return state.scenario === SCENARIO.EMPTY ? [] : state.activity;
}
export function savePreferences(
  state: DemoState,
  preferences: DemoState['preferences'],
): DemoState {
  return {
    ...state,
    preferences: { ...preferences },
    scenario: state.scenario === SCENARIO.OFFLINE ? SCENARIO.PENDING : SCENARIO.SUCCESS,
  };
}
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const timestamp = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}
export function validateExpense(draft: ExpenseDraft): Validation<ValidExpense> {
  const amount = Number(draft.amount);
  if (!draft.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: 'Ingresa un importe positivo en COP, sin separadores de miles.' };
  }
  if (!(CATEGORY as readonly string[]).includes(draft.category)) {
    return { ok: false, message: 'Selecciona una categoría.' };
  }
  if (!validDate(draft.date)) {
    return { ok: false, message: 'Ingresa una fecha válida: AAAA-MM-DD.' };
  }
  return {
    ok: true,
    value: { amount, category: draft.category, date: draft.date, note: draft.note.trim() },
  };
}
export function validateIdentity(identity: string, password?: string): Validation<string> {
  const normalized = identity.trim();
  if (!/^\S+@\S+\.\S+$/.test(normalized) && !/^\+?\d{7,15}$/.test(normalized)) {
    return { ok: false, message: 'Ingresa un correo o teléfono válido de prueba.' };
  }
  if (password !== undefined && password.length < 8) {
    return { ok: false, message: 'Usa una contraseña de prueba de al menos ocho caracteres.' };
  }
  return { ok: true, value: normalized };
}
