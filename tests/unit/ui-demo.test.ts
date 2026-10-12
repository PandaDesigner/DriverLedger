import { describe, expect, it } from "bun:test";
import {
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
  discardDraft,
  enterDemo,
  openWorkspace,
  selectPlatforms,
  updateDraft,
  validateExpense,
  validateIdentity,
} from "../../ui/src/demo/model";

describe("isolated demonstration", () => {
  it("starts fresh, enters onboarding and requires a platform", () => {
    const initial = createDemoState();
    expect(initial.session).toBe(SESSION.LOGIN);
    expect(enterDemo(initial).session).toBe(SESSION.ONBOARDING);
    expect(() => openWorkspace(initial)).toThrow();
    const configured = selectPlatforms(enterDemo(initial), [PLATFORM.UBER]);
    expect(openWorkspace(configured).session).toBe(SESSION.WORKSPACE);
    expect(initial.platforms).toEqual([]);
    expect(createDemoState()).toEqual(initial);
  });
  it("retains drafts until explicit discard or submission", () => {
    const draft = {
      amount: "12000",
      category: "Gasolina",
      date: DEMO_DATE,
      note: "Prueba",
    };
    const edited = updateDraft(createDemoState(), draft);
    expect(edited.draft).toEqual(draft);
    const parsed = validateExpense(draft);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.message);
    }
    const saved = addExpense(edited, parsed.value);
    expect(
      saved.activity.filter((entry) => entry.kind === KIND.EXPENSE),
    ).toHaveLength(2);
    expect(saved.draft.amount).toBe("");
    expect(saved.projectionAvailable).toBe(false);
    expect(discardDraft(edited).draft.amount).toBe("");
    expect(edited.draft.amount).toBe("12000");
  });
  it("confirms once without mutating inputs", () => {
    const initial = createDemoState();
    const trip = {
      id: "manual-demo",
      kind: KIND.TRIP,
      amount: 16000,
      date: DEMO_DATE,
      time: "10:30",
      platform: PLATFORM.UBER,
      note: "Captura manual ficticia",
    };
    const saved = confirmTrip(initial, trip);
    expect(confirmTrip(saved, trip).activity).toHaveLength(
      initial.activity.length + 1,
    );
    expect(initial.confirmed).toEqual([]);
    expect(saved.projectionAvailable).toBe(false);
  });
  it("sets empty/error/offline states explicitly", () => {
    const initial = createDemoState();
    expect(changeScenario(initial, SCENARIO.EMPTY).activity).toEqual(
      initial.activity,
    );
    expect(
      changeScenario(changeScenario(initial, SCENARIO.EMPTY), SCENARIO.READY),
    ).toEqual(initial);
    expect(changeScenario(initial, SCENARIO.ERROR).scenario).toBe(
      SCENARIO.ERROR,
    );
    expect(changeScenario(initial, SCENARIO.OFFLINE).activity).toEqual(
      initial.activity,
    );
  });
});

describe("presentation boundary validation", () => {
  const valid = {
    amount: "12000",
    category: "Otros",
    date: DEMO_DATE,
    note: "",
  };
  it("rejects invalid expense amount, category and calendar date", () => {
    for (const amount of ["", "0", "-2", "abc", "Infinity"]) {
      expect(validateExpense({ ...valid, amount }).ok).toBe(false);
    }
    expect(validateExpense({ ...valid, category: "" }).ok).toBe(false);
    for (const date of ["2026-02-30", "yesterday", "2026-13-01"]) {
      expect(validateExpense({ ...valid, date }).ok).toBe(false);
    }
    expect(validateExpense(valid).ok).toBe(true);
  });
  it("accepts an email or phone but requires password for sign-in", () => {
    expect(validateIdentity("demo@example.com", "prueba123").ok).toBe(true);
    expect(validateIdentity("3001234567", "prueba123").ok).toBe(true);
    expect(validateIdentity("bad", "prueba123").ok).toBe(false);
    expect(validateIdentity("demo@example.com", "").ok).toBe(false);
    expect(validateIdentity("demo@example.com").ok).toBe(true);
  });
});
