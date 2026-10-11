-- 0001_init_schema.sql
-- Phase 0a (setup-supabase-tables) — remote source-of-truth schema for DriverLedger.
-- Source of truth: docs/RFC-002-modelo-datos.md (column shapes, indexes, RLS rule).
-- Spec:            openspec/changes/setup-supabase-tables/specs/data-model/spec.md.
-- Design:          openspec/changes/setup-supabase-tables/design.md §1.1–1.5.
--
-- Encodes 6 tables (plataformas, carreras, gastos_fijos, gastos_diarios,
-- log_eventos, sync_queue), CHECK constraints for enums, indexes for the
-- upsert-by-trip_id and queue-drain query paths, and the set_updated_at()
-- trigger function attached to every table that carries updated_at.
--
-- RLS policies, seeds, realtime publication, and storage buckets are
-- applied in follow-up files (0002, 0003, supabase_realtime.sql, storage.sql).

begin;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- pgcrypto provides gen_random_uuid() used as default for id columns.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: set_updated_at() trigger function
-- ---------------------------------------------------------------------------
-- Per proposal Q5 default (DB BEFORE UPDATE trigger overrides client-set
-- values). Attached to every table that has an updated_at column (carreras).
-- Other tables either don't need it (log_eventos is append-only with
-- created_at) or maintain their own timestamp (sync_queue.ultimo_intento).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. plataformas
-- ---------------------------------------------------------------------------
-- Global reference data (open-closed principle, RFC-002 §Open-closed).
-- New platforms (e.g. Rappi) are inserted into this table without a schema
-- migration. RLS for this table lives in 0002_rls_policies.sql.

create table if not exists public.plataformas (
  id              uuid        primary key default extensions.gen_random_uuid(),
  nombre          text        not null,
                             unique,
  comision        numeric(5,2) not null
                             check (comision >= 0 and comision <= 100),
  tipo_estrategia text        not null,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table  public.plataformas              is 'Ride-hailing platforms known to the app; open-closed via INSERT (no migration needed for new platforms).';
comment on column public.plataformas.nombre       is 'Display name (Uber, DiDi, InDrive, ...); unique.';
comment on column public.plataformas.comision     is 'Platform commission as percentage (0-100).';
comment on column public.plataformas.tipo_estrategia is 'Strategy key consumed by Strategy pattern (uber_api, didi_manual, indrive_form, ...).';

-- ---------------------------------------------------------------------------
-- 2. carreras
-- ---------------------------------------------------------------------------
-- Driver-scoped trip log. Upsert by (driver_id, trip_id) per Gherkin
-- "Upsert por trip_id" + RFC-002. updated_at trigger guarantees last-write-wins
-- ordering regardless of which writer lands first.

create table if not exists public.carreras (
  id            uuid           primary key default extensions.gen_random_uuid(),
  driver_id     uuid           not null,
  trip_id       text           not null,
  plataforma_id uuid           not null references public.plataformas(id),
  tarifa_bruta  numeric(12,2)  not null,
  comision      numeric(12,2)  not null,
  gasolina      numeric(12,2)  not null default 0,
  origen        text,
  destino       text,
  distancia_km  numeric(8,2),
  duracion_min  integer,
  estado        text           not null
                                check (estado in ('activa','completada','cancelada')),
  fuente        text           not null
                                check (fuente in ('manual','api','background')),
  fecha         date           not null default current_date,
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now(),
  metadata      jsonb          not null default '{}'::jsonb,
                                unique (driver_id, trip_id)
);

create index if not exists idx_carreras_fecha
  on public.carreras (fecha);

create index if not exists idx_carreras_driver_updated
  on public.carreras (driver_id, updated_at desc);

-- BEFORE UPDATE trigger for updated_at (proposal Q5 default).
drop trigger if exists trg_carreras_set_updated_at on public.carreras;
create trigger trg_carreras_set_updated_at
  before update on public.carreras
  for each row execute function public.set_updated_at();

comment on table  public.carreras           is 'Per-driver trip log; upsert by (driver_id, trip_id).';
comment on column public.carreras.trip_id   is 'Provider-supplied trip id (Uber API) or local uuid; unique per driver.';
comment on column public.carreras.fuente    is 'Originating writer: manual (driver confirmed), api (Uber Driver API), background (expo-task-manager).';
comment on column public.carreras.estado    is 'Lifecycle: activa, completada, cancelada.';
comment on column public.carreras.fecha     is 'Business date of the trip (independent of the row created_at). Defaults to today; back-dated entries are valid.';

-- ---------------------------------------------------------------------------
-- 3. gastos_fijos
-- ---------------------------------------------------------------------------
-- Driver-scoped recurring monthly expenses. Empty seed per proposal Q6
-- default (driver fills in onboarding, not via migration).

create table if not exists public.gastos_fijos (
  id            uuid          primary key default extensions.gen_random_uuid(),
  driver_id     uuid          not null,
  nombre        text          not null,
  monto_mensual numeric(12,2) not null,
  activo        boolean       not null default true,
  metadata      jsonb         not null default '{}'::jsonb
);

create index if not exists idx_gastos_fijos_driver
  on public.gastos_fijos (driver_id);

comment on table public.gastos_fijos is 'Per-driver recurring monthly expenses (insurance, loan, phone plan, ...).';

-- ---------------------------------------------------------------------------
-- 4. gastos_diarios
-- ---------------------------------------------------------------------------
-- Driver-scoped day-level variable expenses (fuel top-ups, food, parking).

create table if not exists public.gastos_diarios (
  id        uuid          primary key default extensions.gen_random_uuid(),
  driver_id uuid          not null,
  fecha     date          not null,
  categoria text          not null,
  monto     numeric(12,2) not null,
  metadata  jsonb         not null default '{}'::jsonb
);

create index if not exists idx_gastos_diarios_driver_fecha
  on public.gastos_diarios (driver_id, fecha);

comment on table public.gastos_diarios is 'Per-driver daily expenses; queried by (driver_id, fecha).';

-- ---------------------------------------------------------------------------
-- 5. log_eventos
-- ---------------------------------------------------------------------------
-- Append-only event log per driver. Includes sync.* events for the live
-- sync-status view (publishes to supabase_realtime per realtime spec).

create table if not exists public.log_eventos (
  id         uuid        primary key default extensions.gen_random_uuid(),
  driver_id  uuid        not null,
  tipo       text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_log_eventos_driver_created
  on public.log_eventos (driver_id, created_at desc);

create index if not exists idx_log_eventos_tipo
  on public.log_eventos (tipo);

comment on table  public.log_eventos       is 'Per-driver append-only event log; includes sync.* lifecycle events.';
comment on column public.log_eventos.tipo   is 'Dot-namespaced event type (e.g. sync.completed, sync.failed, carrera.registered).';

-- ---------------------------------------------------------------------------
-- 6. sync_queue
-- ---------------------------------------------------------------------------
-- Local-first write queue. Drain flow per RFC-004 §Flujo 4:
-- pendiente -> procesando -> completado (or fallido -> pausado after 5).

create table if not exists public.sync_queue (
  id            uuid        primary key default extensions.gen_random_uuid(),
  driver_id     uuid        not null,
  tabla         text        not null,
  registro_id   uuid        not null,
  operacion     text        not null
                              check (operacion in ('insert','update','upsert','delete')),
  intentos      integer     not null default 0,
  ultimo_intento timestamp       null,
  estado        text        not null
                              check (estado in ('pendiente','procesando','completado','fallido','pausado')),
  metadata      jsonb       not null default '{}'::jsonb
);

create index if not exists idx_sync_queue_driver_estado
  on public.sync_queue (driver_id, estado);

create index if not exists idx_sync_queue_ultimo_intento
  on public.sync_queue (ultimo_intento);

comment on table  public.sync_queue            is 'Pending writes from the offline-first SQLite layer to Supabase.';
comment on column public.sync_queue.tabla      is 'Target table name (carreras, gastos_diarios, ...).';
comment on column public.sync_queue.operacion  is 'Pending mutation kind: insert, update, upsert, delete.';
comment on column public.sync_queue.intentos   is 'Failed-attempt counter; >=5 -> paused (RFC-004 §Flujo 4).';

commit;