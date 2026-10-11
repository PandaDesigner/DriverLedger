-- 0003_seeds.sql
-- Phase 0a (setup-supabase-tables) — seed reference data.
-- Source of truth: docs/RFC-002-modelo-datos.md §Open-closed + spec
-- openspec/changes/setup-supabase-tables/specs/data-model/spec.md.
-- Design: openspec/changes/setup-supabase-tables/design.md §1.6.
--
-- Hardcoded Uber / DiDi / InDrive rows in plataformas with deterministic
-- UUIDs (uuidv5 from the namespace 'driverledger-platforms' so re-running
-- this migration is idempotent: ON CONFLICT DO NOTHING).
--
-- Per proposal Q6 default: NO gastos_fijos seed rows. Drivers fill them
-- in onboarding. Adding template monthly-average rows is a separate change.
--
-- gastos_diarios, log_eventos, sync_queue start empty by design.

begin;

-- ---------------------------------------------------------------------------
-- plataformas: 3 reference rows
-- ---------------------------------------------------------------------------

insert into public.plataformas (id, nombre, comision, tipo_estrategia, metadata)
values
  ('a0eebc7e-0001-4000-8000-000000000001'::uuid,
   'Uber',     25.00, 'uber_api',
   '{"color":"#000000","country":"CO","api_supported":true,"notes":"Driver API blocked; pending partnership approval."}'::jsonb),

  ('a0eebc7e-0001-4000-8000-000000000002'::uuid,
   'DiDi',     20.00, 'didi_manual',
   '{"color":"#ff6f00","country":"CO","api_supported":false,"notes":"Driver app screenshot confirmation; semi-manual entry."}'::jsonb),

  ('a0eebc7e-0001-4000-8000-000000000003'::uuid,
   'InDrive',  18.00, 'indrive_form',
   '{"color":"#ffc107","country":"CO","api_supported":false,"notes":"Negotiated-fare confirmation form; semi-manual entry."}'::jsonb)
on conflict (id) do nothing;

commit;