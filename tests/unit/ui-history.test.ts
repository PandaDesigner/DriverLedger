import { describe, expect, it } from "bun:test";
import { KIND, PLATFORM, RANGE, SCENARIO } from "../../ui/src/demo/contracts";
import { createDemoState } from "../../ui/src/demo/model";
import {
  filterActivity,
  groupActivity,
  hasProjection,
  initialFilter,
  parseHistoryKind,
} from "../../ui/src/demo/history";

describe("history presentation", () => {
  it("filters platform without hiding unassigned expenses", () => {
    const selected = filterActivity(createDemoState().activity, {
      ...initialFilter(),
      platform: PLATFORM.UBER,
    });
    expect(selected.some((entry) => entry.kind === KIND.EXPENSE)).toBe(true);
    expect(
      selected
        .filter((entry) => entry.kind === KIND.TRIP)
        .every((entry) => entry.platform === PLATFORM.UBER),
    ).toBe(true);
  });
  it("filters type and supports empty custom selections", () => {
    expect(
      filterActivity(createDemoState().activity, {
        ...initialFilter(),
        kind: KIND.EXPENSE,
      }),
    ).toHaveLength(1);
    expect(
      filterActivity(createDemoState().activity, {
        ...initialFilter(),
        range: RANGE.CUSTOM,
        from: "2020-01-01",
        to: "2020-01-02",
      }),
    ).toEqual([]);
  });
  it("groups days with chronologically descending rows", () => {
    const grouped = groupActivity(
      filterActivity(createDemoState().activity, {
        ...initialFilter(),
        range: RANGE.MONTH,
      }),
    );
    expect(grouped.length).toBeGreaterThan(1);
    for (const group of grouped) {
      expect(group.activity.every((entry) => entry.date === group.date)).toBe(
        true,
      );
    }
  });
  it("does not reuse projections for mismatched filters", () => {
    const initial = createDemoState();
    expect(hasProjection(initial, initialFilter())).toBe(true);
    expect(
      hasProjection(initial, { ...initialFilter(), kind: KIND.EXPENSE }),
    ).toBe(false);
    expect(
      hasProjection(initial, { ...initialFilter(), range: RANGE.WEEK }),
    ).toBe(false);
  });
  it("does not reuse the ordinary projection for the reached-goal scenario", () => {
    expect(hasProjection({ ...createDemoState(), scenario: SCENARIO.GOAL }, initialFilter())).toBe(false);
  });
  it("validates incoming filter parameters once", () => {
    expect(parseHistoryKind(undefined)).toEqual({ ok: true, value: KIND.ALL });
    expect(parseHistoryKind(KIND.EXPENSE)).toEqual({
      ok: true,
      value: KIND.EXPENSE,
    });
    expect(parseHistoryKind("invalid").ok).toBe(false);
    expect(parseHistoryKind([KIND.EXPENSE]).ok).toBe(false);
  });
});
