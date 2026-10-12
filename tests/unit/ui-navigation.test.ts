import { expect, it } from "bun:test";
import { entryRoute } from "../../ui/src/demo/navigation";
import { ROUTE, SESSION } from "../../ui/src/demo/contracts";
it("routes demonstration sessions without granting real authentication", () => {
  expect(entryRoute(SESSION.LOGIN)).toBe(ROUTE.LOGIN);
  expect(entryRoute(SESSION.ONBOARDING)).toBe(ROUTE.ONBOARDING);
  expect(entryRoute(SESSION.WORKSPACE)).toBe(ROUTE.DASHBOARD);
});
