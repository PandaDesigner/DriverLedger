import { DEMO_DATE, KIND, PLATFORM, RANGE, type Activity, type DemoState, type HistoryFilter, type Validation } from './contracts';
export function initialFilter(): HistoryFilter { return { range: RANGE.TODAY, platform: PLATFORM.ALL, kind: KIND.ALL, from: DEMO_DATE, to: DEMO_DATE }; }
export function parseHistoryKind(kind: unknown): Validation<HistoryFilter['kind']> {
  if (kind === undefined) { return { ok: true, value: KIND.ALL }; }
  if (kind === KIND.ALL || kind === KIND.TRIP || kind === KIND.EXPENSE) { return { ok: true, value: kind }; }
  return { ok: false, message: 'Filtro de actividad no válido. Limpia los filtros para continuar.' };
}
export function filterActivity(activity: readonly Activity[], filter: HistoryFilter): readonly Activity[] {
  const from = filter.range === RANGE.CUSTOM ? filter.from : filter.range === RANGE.MONTH ? '2026-10-01' : DEMO_DATE;
  const to = filter.range === RANGE.CUSTOM ? filter.to : filter.range === RANGE.WEEK ? '2026-10-18' : filter.range === RANGE.MONTH ? '2026-10-31' : DEMO_DATE;
  return activity.filter((entry) => entry.date >= from && entry.date <= to && (filter.kind === KIND.ALL || entry.kind === filter.kind) && (filter.platform === PLATFORM.ALL || entry.kind === KIND.EXPENSE || entry.platform === filter.platform)).toSorted((first, second) => `${second.date} ${second.time}`.localeCompare(`${first.date} ${first.time}`));
}
export function groupActivity(activity: readonly Activity[]): readonly { date: string; activity: readonly Activity[] }[] {
  return [...new Set(activity.map((entry) => entry.date))].toSorted().reverse().map((date) => ({ date, activity: activity.filter((entry) => entry.date === date) }));
}
export function hasProjection(state: DemoState, filter: HistoryFilter): boolean { return state.projectionAvailable && filter.range === RANGE.TODAY && filter.platform === PLATFORM.ALL && filter.kind === KIND.ALL; }
