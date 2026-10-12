import { describe, expect, it } from "bun:test";
import {
  CATEGORY,
  DEMO_DATE,
  KIND,
  PLATFORM,
  SCENARIO,
  SESSION,
} from "../../ui/src/demo/contracts";
import {
  addExpense,
  changeScenario,
  confirmTrip,
  createDemoState,
  enterDemo,
  nextTripId,
  openWorkspace,
  savePreferences,
  selectPlatforms,
  updateDraft,
  validateExpense,
  visibleActivity,
} from "../../ui/src/demo/model";
import {
  filterActivity,
  hasProjection,
  initialFilter,
} from "../../ui/src/demo/history";
describe("demonstration flows without native rendering", () => {
  it("onboards, confirms two distinct drafts, and preserves idempotent retry", () => {
    const workspace = openWorkspace(
      selectPlatforms(enterDemo(createDemoState()), [PLATFORM.UBER]),
    );
    const trip = {
      id: nextTripId(workspace),
      kind: KIND.TRIP,
      amount: 18000,
      date: DEMO_DATE,
      time: "10:30",
      platform: PLATFORM.UBER,
      note: "Prueba",
    };
    const first = confirmTrip(workspace, trip);
    const retried = confirmTrip(first, trip);
    expect(retried).toEqual(first);
    const second = confirmTrip(retried, { ...trip, id: nextTripId(retried) });
    expect(second.confirmed).toHaveLength(2);
    expect(hasProjection(second, initialFilter())).toBe(false);
  });
  it("preserves draft and preferences through empty/offline scenarios", () => {
    const workspace = openWorkspace(
      selectPlatforms(enterDemo(createDemoState()), [PLATFORM.DIDI]),
    );
    const edited = updateDraft(workspace, {
      amount: "15000",
      category: CATEGORY[0],
      date: DEMO_DATE,
      note: "Prueba",
    });
    const empty = changeScenario(edited, SCENARIO.EMPTY);
    expect(visibleActivity(empty)).toEqual([]);
    expect(empty.draft).toEqual(edited.draft);
    expect(empty.session).toBe(SESSION.WORKSPACE);
    const restored = changeScenario(empty, SCENARIO.READY);
    expect(visibleActivity(restored)).toEqual(workspace.activity);
    const preferences = { target: "250000", notifications: true };
    const configured = savePreferences(
      changeScenario(restored, SCENARIO.OFFLINE),
      preferences,
    );
    expect(configured.preferences).toEqual(preferences);
    expect(configured.scenario).toBe(SCENARIO.PENDING);
    const checked = validateExpense(configured.draft);
    if (!checked.ok) {
      throw new Error(checked.message);
    }
    const saved = addExpense(configured, checked.value);
    expect(saved.scenario).toBe(SCENARIO.PENDING);
    expect(
      filterActivity(saved.activity, {
        ...initialFilter(),
        kind: KIND.EXPENSE,
      }),
    ).toHaveLength(2);
    expect(savePreferences(saved, preferences).scenario).toBe(SCENARIO.SUCCESS);
    expect(createDemoState().preferences.notifications).toBe(false);
  });
});
