import { ROUTE, SESSION, type DemoState, type Validation } from './contracts';
export function entryRoute(
  session: DemoState['session'],
): typeof ROUTE.LOGIN | typeof ROUTE.ONBOARDING | typeof ROUTE.DASHBOARD {
  if (session === SESSION.WORKSPACE) {
    return ROUTE.DASHBOARD;
  }
  if (session === SESSION.ONBOARDING) {
    return ROUTE.ONBOARDING;
  }
  return ROUTE.LOGIN;
}
const PRIMARY_ROUTES = new Set<(typeof ROUTE)[keyof typeof ROUTE]>([
  ROUTE.LOGIN,
  ROUTE.REGISTER,
  ROUTE.RECOVERY,
  ROUTE.ONBOARDING,
  ROUTE.DASHBOARD,
  ROUTE.HISTORY,
  ROUTE.SETTINGS,
]);
export function parsePrimaryRoute(value: unknown): Validation<(typeof ROUTE)[keyof typeof ROUTE]> {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, message: 'Ruta ausente o no válida.' };
  }
  if (!PRIMARY_ROUTES.has(value as (typeof ROUTE)[keyof typeof ROUTE])) {
    return { ok: false, message: 'Ruta de demostración no reconocida.' };
  }
  return { ok: true, value: value as (typeof ROUTE)[keyof typeof ROUTE] };
}
