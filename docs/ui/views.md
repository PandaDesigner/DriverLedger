# View Inventory

## Shared rules

- Mobile-first and safe-area aware.
- Minimum touch target: 48pt for primary controls.
- One primary action per view.
- High contrast in light and dark mode.
- No emoji as structural icons.
- Loading, empty, error and success states must be designed before implementation.
- The driver must be able to understand the important state without reading a long paragraph.

## V01 — Login

**Job:** authenticate quickly before a driving session.

**Composition:** brand mark, email/phone field, password field, primary sign-in action, password recovery link, registration link.

**States:** initial, submitting, invalid credentials, offline, authenticated.

**Reference use:** calm spacing and clear form hierarchy; no decorative dashboard content.

## V02 — Registration

**Job:** create the driver account with the smallest viable form.

**Composition:** identity fields, password, consent/terms, primary create-account action.

**States:** validation error, submitting, account created, network failure.

**Reference use:** progressive disclosure; avoid a long first-run form.

## V03 — Forgot password

**Job:** request an account recovery message.

**Composition:** one identifier field, primary send action, return-to-login action.

**States:** initial, submitting, sent, unknown account, offline.

## V04 — Platform onboarding

**Job:** prepare the platforms used by the driver.

**Composition:** progress indicator, platform selection cards for Uber/DiDi/InDrive, connection mode, continue action.

**States:** no platform selected, selected, partially configured, completed.

**Reference use:** segmented selection and focused setup cards; platform status must be textual, not color-only.

## V05 — Dashboard

**Job:** answer “how am I doing today?” and expose the fastest next action.

**Composition order:**

1. Greeting, date and sync/offline status.
2. Daily progress hero: net target, current net, remaining amount and completion percentage.
3. KPI row: trips completed, gross income, expenses and active time.
4. Weekly overview: daily net progress for the current week.
5. Recent activity: latest trips and expenses.
6. Central quick action: add/confirm a trip or add an expense.

**Primary action:** confirm or register a trip.

**States:** loading skeleton, no trips yet, active trip, target reached, offline, sync pending, data error.

**Reference use:** Reference 3 supplies the composition; Reference 1 supplies status-card/detail language; Reference 2 supplies dark detail surfaces and tracking context.

## V06 — History

**Job:** inspect previous trips and expenses without mixing them into the live dashboard.

**Composition:**

1. Dark navy header with `Historial` and a date-range control.
2. Time-range segments: `Hoy`, `Esta semana`, `Este mes`.
3. Platform filters: `Todas`, `Uber`, `DiDi`, `InDrive`.
4. Summary card: net accumulated, income, expenses and trip count.
5. Chronological grouped activity list with trips and expenses.
6. The same five-item bottom navigation as Dashboard: Dashboard, Historial, Nuevo viaje, Gastos, Ajustes.

**States:** loading, no history, filtered empty, offline cached history, error.

**Interaction:** tap an item for detail; filters must remain easy to clear.

### History use cases

| ID | Use case | Trigger | Expected result |
|---|---|---|---|
| H-01 | Review today's activity | Driver opens Historial | Today's trips and expenses appear in chronological order. |
| H-02 | Change time range | Driver selects week/month/custom range | Summary totals and activity list recalculate for the selected range. |
| H-03 | Filter by platform | Driver selects Uber, DiDi or InDrive | Only matching trips remain visible; expenses remain visible when not platform-specific. |
| H-04 | Inspect a trip | Driver taps a trip row | Trip detail opens with value, platform, source, time and route when available. |
| H-05 | Inspect an expense | Driver taps an expense row | Expense detail opens with amount, category, date and note. |
| H-06 | Recover from filtered empty | Selected filters return no records | Empty state explains the filter and offers a clear/reset action. |
| H-07 | Browse offline history | Network is unavailable | Cached records remain readable and sync status is visible. |

## V07 — Settings

**Job:** manage account and operating preferences.

**Sections:** profile, platforms, target configuration, notifications, sync status, appearance, privacy and sign out.

**States:** saved, saving, validation error, offline pending.

**Constraint:** secondary navigation belongs here; it must not overload the bottom navigation.

## M01 — Trip confirmation modal

**Job:** turn a detected or manually entered trip into a saved record with one deliberate tap.

**Content:** platform, estimated/received value, origin/destination when available, source, timestamp, edit affordance and confirm action.

**States:** ready, saving, saved, conflict, error.

**Safety:** cancel remains visible; never confirm by timeout or hidden gesture.

## M02 — Expense entry modal

**Job:** record a daily expense quickly.

**Content:** amount, category, date, optional note and save action.

**States:** ready, validation error, saving, saved, offline pending.

**Safety:** preserve draft on accidental dismissal when input has started.

