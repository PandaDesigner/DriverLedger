## MODIFIED Requirements

### Requirement: Expo Router placeholder route

`ui/index.ts` SHALL import `expo-router/entry`. `ui/app/index.tsx` SHALL open the DriverLedger demonstration entry flow. `ui/App.tsx` SHALL remain a tooling-compatibility no-op root. The application SHALL identify itself as a demonstration without granting access to real driver records.

#### Scenario: demonstration bundle boots

- GIVEN the demonstration starts without an authenticated production session
- WHEN the bundle mounts at `/`
- THEN the login entry SHALL be available
- AND the UI SHALL identify the flow as a demonstration

### Requirement: No behaviour outside the placeholder

The original bootstrap SHALL remain infrastructure-only. Subsequent OpenSpec changes MAY replace its placeholder with screens and navigation. `add-ui-shell-and-screens` SHALL limit code changes to `ui/` and `tests/`, SHALL NOT introduce production business logic or data access, and SHALL keep its artifacts inside its change directory until archive.

#### Scenario: phase 3 respects ownership

- GIVEN the phase 3 change is implemented
- WHEN its diff is inspected
- THEN code changes SHALL be confined to `ui/` and `tests/`
- AND the change SHALL NOT modify `data/` or `services/`
