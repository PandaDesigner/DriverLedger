# DriverLedger UI Design Reference

Status: design-only. No React Native implementation is defined in this folder yet.

This folder is the design contract for Fase 3 (`add-ui-shell-and-screens`). The PRD remains the source of product behavior; the supplied UI references define visual hierarchy and interaction quality.

The execution plan documents the Fase 3 scope as “7 screens + 2 modals” and now points to the per-screen contract in this folder. Detailed behavior remains in `views.md` so the plan can stay focused on execution and dependencies.

## Source of truth

- `docs/PRD-consolidado.md` §6 — required screens and UX principles.
- `.claude/plans/driverledger-fase-0-7.plan.md` — Fase 3 scope and ownership.
- `docs/RFC-003-logica-registro.md` — one-tap trip confirmation and app modes.
- `docs/RFC-004-sincronizacion.md` — offline/sync states.

## Reference translation

- Reference 1: dashboard hierarchy, dominant metric, status cards, segmented context, focused detail.
- Reference 2: dark detail surfaces, tracking/map/timeline patterns, progressive forms and bottom navigation.
- Reference 3: productivity dashboard composition — greeting, progress hero, KPI tiles, weekly overview, upcoming activity and central quick action.

The domain is always DriverLedger: trips, daily net target, expenses, history, platforms and sync status. Generic tasks, habits and gamification are not part of the product.

## Views to implement

| ID | View | Route responsibility | Primary outcome |
|---|---|---|---|
| V01 | Login | Authenticate an existing driver | Enter the app safely |
| V02 | Registration | Create a driver account | Start account setup |
| V03 | Forgot password | Recover access | Request a reset |
| V04 | Platform onboarding | Select/configure Uber, DiDi and InDrive | Prepare the driver workspace |
| V05 | Dashboard | Show today's operating picture | Understand progress and take the next action |
| V06 | History | Review trips and expenses | Inspect past activity |
| V07 | Settings | Manage profile, platforms, sync and preferences | Configure the app |
| M01 | Trip confirmation modal | Confirm a detected/manual trip | Save a trip with one tap |
| M02 | Expense entry modal | Add a daily expense | Record an expense with minimal input |

## Generated visual references

These are design references generated from the approved direction. They are not production assets and do not replace native React Native implementation.

| View | Reference |
|---|---|
| Login | `references/login.png` |
| Registration | `references/registration.png` |
| Forgot password | `references/forgot-password.png` |
| Platform onboarding | `references/onboarding-platforms.png` |
| Dashboard | `references/dashboard.png` |
| History | `references/history-v2.png` |
| Settings | `references/settings.png` |
| Trip confirmation | `references/confirm-trip.png` |
| Expense entry | `references/add-expense.png` |

## Implementation boundary

The eventual implementation belongs in `ui/` and must not cross into `data/` or `services/` during Fase 3. These documents define the screens, not the backend contracts.

