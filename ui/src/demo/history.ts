import type { Activity, DemoState, HistoryFilter, Validation } from './contracts';
export function initialFilter(): HistoryFilter { throw new Error('Filter not implemented'); }
export function parseHistoryKind(_kind: unknown): Validation<HistoryFilter['kind']> { throw new Error('Route validation not implemented'); }
export function filterActivity(_activity: readonly Activity[], _filter: HistoryFilter): readonly Activity[] { throw new Error('History not implemented'); }
export function groupActivity(_activity: readonly Activity[]): readonly { date: string; activity: readonly Activity[] }[] { throw new Error('Grouping not implemented'); }
export function hasProjection(_state: DemoState, _filter: HistoryFilter): boolean { throw new Error('Projection selection not implemented'); }
