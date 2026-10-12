## ADDED Requirements

### Requirement: Explicit demonstration boundary

Every surface SHALL visibly identify fictitious data. Simulated authentication, recovery, platform setup, preferences, trip and expense actions SHALL NOT send requests, persist credentials, write production records or claim real synchronization. Financial projections SHALL be preloaded examples, not calculations from real records.

#### Scenario: simulated recovery

- GIVEN a valid demonstration identifier
- WHEN recovery is submitted
- THEN the response SHALL state that no email was sent

#### Scenario: repeated confirmation

- GIVEN a demonstration trip was already confirmed
- WHEN confirmation is submitted again
- THEN only one synthetic activity record SHALL exist

### Requirement: Seven views and two modals

The UI SHALL provide Login, Registration, Recovery, Platforms onboarding, Dashboard, History and Settings, plus Confirm trip and Add expense modals, following the composition and per-view states in `docs/ui/views.md`.

#### Scenario: demonstration entry flow

- GIVEN a new demonstration session
- WHEN the user completes simulated registration and platform selection
- THEN the Dashboard SHALL open without creating a real account

#### Scenario: invalid form

- GIVEN a required field is missing
- WHEN the user submits
- THEN the UI SHALL explain the field error and retain the editable input

### Requirement: Single bottom navigation

Main views SHALL share Dashboard, History, New trip, Expenses and Settings controls. New trip SHALL open Confirm trip. Expenses SHALL open History filtered by expenses, not another business screen. Add expense SHALL have a visible action in that context.

#### Scenario: expenses shortcut

- GIVEN Dashboard is open
- WHEN Expenses is selected
- THEN History SHALL show only synthetic expenses
- AND clearing the type filter SHALL restore all activity

### Requirement: Dashboard and history composition

Dashboard SHALL show greeting/date/status, goal projection, KPIs, weekly projection and recent activity in that order. History SHALL support today/week/month/custom ranges, platform and type filters, daily grouping and inline trip/expense details. Summaries SHALL match the scenario and selected range/platform/type. Preloaded projections SHALL identify their selection; selections or mutations without a matching projection SHALL show that the projection is unavailable, never a stale or invented financial total.

#### Scenario: platform filter

- GIVEN synthetic trips and expenses exist
- WHEN a platform is selected
- THEN other platforms' trips SHALL be hidden
- AND expenses without a platform SHALL remain unless excluded by type

#### Scenario: empty selection

- GIVEN no activities match the filters
- WHEN History renders
- THEN it SHALL show an empty state with a clear-filters action

### Requirement: Deliberate modal actions

Confirm trip SHALL show platform, fare, available route, duration, fuel estimate, commission, net example, source and time, with explicit confirmation, edit and cancel. Add expense SHALL validate amount/category/date and support an optional note. Dismissing Add expense SHALL preserve its draft for the current demonstration session.

#### Scenario: dismiss expense draft

- GIVEN an unfinished expense draft
- WHEN the modal is dismissed and reopened
- THEN its fields SHALL retain their values until submitted or explicitly discarded

### Requirement: Accessible themes and states

The UI SHALL support light/dark semantic tokens, safe areas, primary targets of at least 48pt, accessible labels, text scaling and reduced motion. Applicable loading/empty/error/offline/pending/success/permission scenarios SHALL be reproducible without network or GPS operations; errors SHALL expose recovery actions.

#### Scenario: reduced motion

- GIVEN reduced motion is enabled
- WHEN navigation or state feedback occurs
- THEN essential actions SHALL remain usable without decorative motion

#### Scenario: offline demonstration

- GIVEN the offline scenario is selected
- WHEN a demonstration expense is submitted
- THEN feedback SHALL identify simulated pending status without claiming a real queue write
