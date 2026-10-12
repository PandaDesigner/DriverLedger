import { ROUTE, SESSION, type DemoState } from './contracts';
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
