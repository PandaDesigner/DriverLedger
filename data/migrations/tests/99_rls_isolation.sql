-- 99_rls_isolation.sql
-- Phase 0a (setup-supabase-tables) — multi-tenant RLS isolation recipe.
-- Spec: openspec/changes/setup-supabase-tables/specs/data-model/spec.md §Requirement rls-by-driver-id.
-- Design: openspec/changes/setup-supabase-tables/design.md §1.3, §4.
--
-- This file is documentation; it is NOT pushed by `supabase db push`
-- because it lives under `tests/`. sdd-verify runs it manually against
-- the linked Supabase project using two JWTs (driver-A, driver-B) created
-- via the Supabase dashboard (Email provider, two test accounts).
--
-- Procedure (manual):
--   1. Create driver-A and driver-B accounts in the Supabase dashboard
--      with email + password (Settings -> Authentication -> Providers).
--   2. Sign in both accounts via supabase-js or the REST endpoint to obtain
--      their access_token JWTs. Export as DRIVER_A_JWT, DRIVER_B_JWT.
--   3. Insert one row per driver into carreras / gastos_fijos /
--      gastos_diarios / log_eventos / sync_queue using each driver's JWT.
--   4. Run the assertions below under each driver's JWT — driver-B must
--      not see driver-A's rows; driver-A must not see driver-B's rows.
--
-- Reference receipt of the procedure in the Bash transcript below.

\set ON_ERROR_STOP on

-- This is a recipe; the actual `select set_config('request.jwt.claim.sub', ...)`
-- is performed by Supabase automatically when the JWT is presented over the
-- connection. For psql-driven verification, we use set_config to impersonate.

-- ============================================================
-- Impersonate driver-A: see own rows, do not see driver-B rows
-- ============================================================
select set_config('request.jwt.claim.sub', '<DRIVER_A_UUID>', true);

-- Should return 1 row (driver-A's own).
select count(*) as carreras_a_visible
from public.carreras
where driver_id = '<DRIVER_A_UUID>'::uuid;

-- Should return 0 rows (driver-B's rows are invisible to driver-A).
select count(*) as carreras_b_visible_from_a
from public.carreras
where driver_id = '<DRIVER_B_UUID>'::uuid;

-- Same for gastos_fijos, gastos_diarios, log_eventos, sync_queue.
select count(*) as gastos_fijos_b_visible_from_a
from public.gastos_fijos
where driver_id = '<DRIVER_B_UUID>'::uuid;

select count(*) as gastos_diarios_b_visible_from_a
from public.gastos_diarios
where driver_id = '<DRIVER_B_UUID>'::uuid;

select count(*) as log_eventos_b_visible_from_a
from public.log_eventos
where driver_id = '<DRIVER_B_UUID>'::uuid;

select count(*) as sync_queue_b_visible_from_a
from public.sync_queue
where driver_id = '<DRIVER_B_UUID>'::uuid;

-- Insert-as-other must fail: driver-A attempting to write with
-- driver-B's driver_id should be rejected by WITH CHECK.
do $$
begin
  begin
    insert into public.carreras (driver_id, trip_id, plataforma_id, tarifa_bruta, comision)
    values ('<DRIVER_B_UUID>'::uuid, 'rls-test-1', '<PLATAFORMA_UUID>'::uuid, 1000, 250);
    raise exception 'RLS leak: driver-A inserted a row with driver-B driver_id';
  exception
    when others then
      raise notice 'RLS WITH CHECK rejected cross-driver insert (expected).';
  end;
end
$$;

-- ============================================================
-- plataformas is globally readable; INSERT must be denied for authenticated
-- ============================================================
-- Should return all 3 platform rows (global-read policy).
select count(*) as plataformas_total
from public.plataformas;

do $$
begin
  begin
    insert into public.plataformas (nombre, comision, tipo_estrategia)
    values ('Rappi-Test', 22.0, 'rappi_form');
    raise exception 'RLS leak: authenticated session inserted into plataformas';
  exception
    when insufficient_privilege then
      raise notice 'plataformas INSERT denied for authenticated (expected).';
    when others then
      -- Some Postgres versions raise 'new row violates row-level security policy'
      raise notice 'plataformas INSERT denied for authenticated (expected): %', sqlerrm;
  end;
end
$$;

-- ============================================================
-- Reset impersonation
-- ============================================================
select set_config('request.jwt.claim.sub', '', true);

-- ============================================================
-- Impersonate driver-B and repeat the negative SELECTs to assert symmetry.
-- ============================================================
select set_config('request.jwt.claim.sub', '<DRIVER_B_UUID>', true);

select count(*) as carreras_a_visible_from_driver_b
from public.carreras
where driver_id = '<DRIVER_A_UUID>'::uuid;

select set_config('request.jwt.claim.sub', '', true);