import { DEMO_DATE, KIND, PLATFORM, type Activity } from './contracts';
export const demoActivity: readonly Activity[] = [
  { id: 'trip-1', kind: KIND.TRIP, amount: 18000, date: DEMO_DATE, time: '09:40', platform: PLATFORM.UBER, note: 'El Poblado a Laureles · manual ficticio' },
  { id: 'trip-2', kind: KIND.TRIP, amount: 22000, date: DEMO_DATE, time: '08:50', platform: PLATFORM.DIDI, note: 'Belén a Centro · manual ficticio' },
  { id: 'expense-1', kind: KIND.EXPENSE, amount: 8000, date: DEMO_DATE, time: '08:20', category: 'Alimentación', note: 'Desayuno de ejemplo' },
  { id: 'trip-3', kind: KIND.TRIP, amount: 16000, date: '2026-10-11', time: '16:00', platform: PLATFORM.INDRIVE, note: 'Laureles a Belén · manual ficticio' },
];
export const projection = { target: 200000, net: 30000, remaining: 170000, percent: 15, gross: 40000, expenses: 8000, trips: 2, activeTime: '45 min', remainingTrips: '12 de ejemplo' } as const;
export const weekProjection = [15, 25, 40, 30, 65, 50, 80] as const;
