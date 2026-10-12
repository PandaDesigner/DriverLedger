import { describe, expect, it } from "bun:test";
import { entryRoute, parsePrimaryRoute } from "../../ui/src/demo/navigation";
import { ROUTE, SESSION } from "../../ui/src/demo/contracts";

describe("demonstration navigation", () => {
  it("routes demonstration sessions without granting real authentication", () => {
    expect(entryRoute(SESSION.LOGIN)).toBe(ROUTE.LOGIN);
    expect(entryRoute(SESSION.ONBOARDING)).toBe(ROUTE.ONBOARDING);
    expect(entryRoute(SESSION.WORKSPACE)).toBe(ROUTE.DASHBOARD);
  });
  it("rejects unknown primary routes", () => {
    expect(parsePrimaryRoute(undefined).ok).toBe(false);
    expect(parsePrimaryRoute(null).ok).toBe(false);
    expect(parsePrimaryRoute("").ok).toBe(false);
    expect(parsePrimaryRoute(42).ok).toBe(false);
    expect(parsePrimaryRoute("/secret").ok).toBe(false);
    expect(parsePrimaryRoute(ROUTE.DASHBOARD)).toEqual({
      ok: true,
      value: ROUTE.DASHBOARD,
    });
  });
});
