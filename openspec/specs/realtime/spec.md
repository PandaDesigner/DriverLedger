# realtime Specification

## Purpose
TBD - created by archiving change setup-supabase-tables. Update Purpose after archive.
## Requirements
### Requirement: realtime-publication-scope

The system SHALL publish exactly the tables `carreras` and `log_eventos` to the `supabase_realtime` publication. The system SHALL NOT publish `plataformas`, `gastos_fijos`, `gastos_diarios`, or `sync_queue`.

#### Scenario: dashboard live update

WHEN a `carreras` row is INSERTed from the API integration for driver-A, THEN every open session authenticated as driver-A SHALL receive the new row via the `carreras` realtime channel.

#### Scenario: sync-status live view

WHEN a `log_eventos` row is INSERTed with `tipo = 'sync.completed'` or `tipo = 'sync.failed'`, THEN every open session authenticated as the same driver SHALL receive the event via the `log_eventos` realtime channel.

#### Scenario: gastos not in realtime

WHEN a `gastos_diarios` row is INSERTed, THEN the system SHALL emit no realtime event (clients fetch on demand).

### Requirement: realtime-rls-inherited

Realtime channels SHALL inherit the underlying table's Row-Level Security. A driver-B session SHALL NOT receive driver-A's `carreras` or `log_eventos` rows via realtime.

#### Scenario: realtime isolation

GIVEN two distinct authenticated sessions (driver-A and driver-B), WHEN driver-B subscribes to the `carreras` channel while driver-A inserts a row, THEN driver-B SHALL receive no event for that row.

