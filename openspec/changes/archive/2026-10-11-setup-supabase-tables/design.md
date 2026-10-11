# Design — setup-supabase-tables

> Source of truth: `docs/RFC-002-modelo-datos.md` (column shapes, RLS rule, indexes), `docs/RFC-001-arquitectura.md` §Decisiones 4 (Supabase as source of truth), `docs/RFC-004-sincronizacion.md` (sync_queue contract, last-write-wins), `docs/gherkin-modelo-datos.md` (Scenarios), and the explore observation `sdd/driverledger/setup-supabase-tables/explore` (#1893, 14 open questions + 6-table inventory).

## 1. Architectural decisions

### 1.1 Migration tooling = Supabase CLI + plain SQL files

Plain `.sql` files committed to `data/migrations/` (the directory is already declared by `data/README.md`).

**Why this and not Prisma / Drizzle / TS migrations**:

- **Prisma**: RLS policies and CHECK constraints require raw SQL escape hatches (`prisma$queryRaw`). Two layers of migrations drift apart. Overkill for 6 tables.
- **Drizzle**: TS-first but smaller community for RN/Supabase; we already use Supabase CLI natively.
- **TS migrations** (`supabase/migrations/*.sql` with type-gen): nice for `services/`, but Phase 0 has no client code yet — no consumers for generated types.

Plain SQL wins because: (a) native to Supabase; (b) diff-friendly in git (`git diff data/migrations/0001_init_schema.sql`); (c) aligns with OpenCode ownership of `data/`; (d) no JS toolchain coupling. When Phase 2 (`rxjs-services-sync-queue`) needs type-safety, we will use `supabase gen types typescript` against the deployed DB.

### 1.2 Identity source = `auth.uid()` (no `drivers` table at this stage)

Each row is keyed directly by `auth.users.id` (UUID, supplied by Supabase Auth). Tables carry `driver_id UUID NOT NULL` referencing `auth.users.id` implicitly via RLS policies. There is no separate `drivers` profile table.

**Why lean now**: the explore inventory (#1893) explicitly flagged this as open (Q6). A profile emerges when we need stable display name / avatar / vehicle plate — those are Phase 1+ concerns (onboarding screen, avatar upload). Adding `drivers` now would be overbuilding.

**Future**: when the profile is needed, the change adds `drivers(id UUID PK REFERENCES auth.users(id), display_name, vehicle_plate, ...)` and a FK from the other tables. RLS policy stays `USING (driver_id = auth.uid())` — no churn.

### 1.3 RLS template (per RFC-002)

For driver-scoped tables (`carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`):

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY <table>_select_own ON <table>
  FOR SELECT USING (driver_id = auth.uid());

CREATE POLICY <table>_insert_own ON <table>
  FOR INSERT WITH CHECK (driver_id = auth.uid());

CREATE POLICY <table>_update_own ON <table>
  FOR UPDATE
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY <table>_delete_own ON <table>
  FOR DELETE USING (driver_id = auth.uid());
```

For `plataformas` (global reference data — open/closed principle in RFC-002 §Open-closed):

```sql
ALTER TABLE plataformas ENABLE ROW LEVEL SECURITY;

CREATE POLICY plataformas_select_authenticated ON plataformas
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated = denied.
-- Writes go through service_role (migrations + admin RPC).
```

### 1.4 Schema details per RFC-002

| Table | Notable constraints (delta over RFC-002) |
|-------|-------------------------------------|
| `plataformas` | `UNIQUE(nombre)`, no `driver_id`, no UPDATE/DELETE for authenticated. |
| `carreras` | `UNIQUE(driver_id, trip_id)`, CHECK `estado IN ('activa','completada','cancelada')`, CHECK `fuente IN ('manual','api','background')`, INDEX(`fecha`), INDEX(`driver_id, updated_at DESC`). |
| `gastos_fijos` | INDEX(`driver_id`). |
| `gastos_diarios` | INDEX(`driver_id, fecha`). |
| `log_eventos` | INDEX(`driver_id, created_at DESC`), INDEX(`tipo`). |
| `sync_queue` | CHECK `operacion IN ('insert','update','upsert','delete')`, CHECK `estado IN ('pendiente','procesando','completado','fallido','pausado')`, INDEX(`driver_id, estado`), INDEX(`ultimo_intento`). |

Every extensible table gets `metadata JSONB DEFAULT '{}'::jsonb` for forward evolution.

### 1.5 `updated_at` automation on `carreras`

`carreras` carries an `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` column plus a `BEFORE UPDATE` trigger:

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER carreras_set_updated_at
  BEFORE UPDATE ON carreras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

This guarantees last-write-wins ordering (RFC-004 §Flujo 6) regardless of which side writes — client app, SyncService, or future API integration. Other tables either don't need it (`log_eventos` is append-only with `created_at`) or have their own timestamp (`sync_queue.ultimo_intento`).

### 1.6 Seeds — hardcoded Uber / DiDi / InDrive

`data/migrations/0003_seeds.sql` inserts exactly 3 platform rows with deterministic UUIDs:

| nombre | comision | tipo_estrategia |
|--------|----------|-----------------|
| Uber | 25.00 | uber_api |
| DiDi | 20.00 | didi_manual |
| InDrive | 15.00 | indrive_form |

`gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue` start empty. Open-closed principle (RFC-002 §Open-closed): adding Rappi later = INSERT, not migration.

### 1.7 Realtime publication (restricted scope)

`data/migrations/0004_realtime_publication.sql`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.carreras;
ALTER PUBLICATION supabase_realtime ADD TABLE public.log_eventos;
-- No otras tablas.
```

**Rationale** (per the user-supplied default in chat): `carreras` for cross-device dashboard sync (phone + tablet for the same driver); `log_eventos` for the live sync-status view. `gastos_*` and `sync_queue` are fetched on demand. `plataformas` is global reference data — no realtime needed (rows are static after seed).

### 1.8 Storage buckets

`data/migrations/0005_storage_buckets.sql`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatares', 'avatares', true),
  ('recibos',  'recibos',  false);

-- recibos: per-driver path-prefix RLS
CREATE POLICY recibos_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recibos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY recibos_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recibos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- avatares: public read, auth write
CREATE POLICY avatares_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'avatares');

CREATE POLICY avatares_insert_auth ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatares');
```

### 1.9 Auth (email + password only)

Supabase Auth with `email` provider enabled; phone, magic link, and OAuth providers disabled in the dashboard. JWT carries `sub = auth.users.id`, and `auth.uid()` returns that value inside policies. The Expo app reads tokens through `expo-secure-store` (RFC-001 §Decisiones 8). Magic link and Apple/Google are a separate future change.

## 2. File layout

```
data/
├── README.md                                   # UPDATE: migration workflow + RLS test recipe
├── migrations/
│   ├── 0001_init_schema.sql                    # 6 tables + CHECK + indexes + set_updated_at() trigger
│   ├── 0002_rls_policies.sql                   # driver-scoped RLS + global plataformas SELECT
│   ├── 0003_seeds.sql                          # Uber / DiDi / InDrive
│   ├── 0004_realtime_publication.sql           # supabase_realtime publication (2 tables)
│   ├── 0005_storage_buckets.sql                # 2 buckets + per-driver RLS
│   └── tests/
│       ├── 99_rls_isolation.sql                # multi-tenant RLS smoke test
│       ├── 99_realtime_publication_assert.sql  # asserts only 2 tables in publication
│       └── 99_storage_per_driver_rls.sql       # asserts recibos cross-driver isolation
└── seed.sql                                    # legacy alias for 0003 (kept for data/README symmetry)
```

## 3. Source-of-truth citations

- **RFC-002 §Tablas**: column shapes (6 tables), the `carreras(trip_id) UNIQUE` rule.
- **RFC-002 §Reglas**: RLS-by-`driver_id`, JSONB metadata, indexes (`carreras(fecha)`, `sync_queue(estado)`).
- **RFC-001 §Decisiones 4 + §Alternativas**: Supabase as source of truth; SecureStore for tokens.
- **RFC-004 §Flujo + §Reglas**: sync_queue drain, GPS no sync, last-write-wins, Realtime optional.
- **PRD §3 + §8**: phase 0 scope and the six-tablas contract.
- **`docs/gherkin-modelo-datos.md`**:
  - Scenario "Upsert por trip_id" → justifies `UNIQUE(driver_id, trip_id)` and the UPDATE policy on `carreras`.
  - Scenario "Carrera manual en DiDi o InDrive" → justifies `fuente IN ('manual','api','background')`.
  - Scenario "Carrera en background" → justifies the `background` enum value.
  - Scenario "Drenado de cola" → justifies `estado IN ('pendiente','procesando','completado','fallido','pausado')`.
  - Scenario "Plataforma nueva" → justifies the `plataformas` global-read policy + open/closed INSERT.
- **Explore artifact #1893**: 14 open questions. This design answers 8 as defaults (see Open Questions table in `proposal.md`): Q3 (region), Q5 (realtime scope), Q6 (`drivers` table deferred), Q7 (CHECK enums), Q8 (`carreras` immutability = allow update), Q9 (JSONB schema-less), Q10 (`updated_at` trigger), Q12 (hardcoded seeds).

## 4. Open tradeoffs (forwarded to `proposal.md` Open Questions)

- **Region**: `sa-east-1` chosen for LATAM RTT; `us-east-1` is faster to provision but adds 100–200ms.
- **Plan tier**: Free for dev, Pro for staging. Document the upgrade milestone in `data/README.md`.
- **`carreras` immutability**: UPDATE policy required for API reconciliation per Gherkin "Upsert por trip_id". No DELETE policy beyond driver's own.
- **JSONB metadata**: schema-less (`'{}'::jsonb` default). Canonical shapes documented in `openspec/specs/data-model/spec.md` examples (Phase 4 work).
- **`log_eventos` writes**: clients may insert their own logs (RLS WITH CHECK); `service_role` reserved for system events emitted by Edge Functions in a future change.

## 5. Out of scope (deferred)

- SQLite mirror schema (Phase 1 `local-data-model-sqlite`).
- `SyncService.ts` drain implementation (Phase 2 `rxjs-services-sync-queue`).
- OAuth providers (future change).
- `drivers` profile table (future change once onboarding ships).
- CI pipeline with `openspec validate` gate (future change `add-ci-openspec-gate`).
- Edge Functions for `log_eventos` system events (future).