-- 01_smoke.sql
-- Phase 0a (setup-supabase-tables) — non-applied smoke test.
-- This file is documentation; it is NOT pushed by `supabase db push`
-- because it lives under `tests/`. sdd-verify runs it manually against
-- the linked Supabase project after migrations apply.
--
-- Usage (manual, against the linked remote DB):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=on -f data/migrations/tests/01_smoke.sql
--
-- Asserts: the 6 tables exist after 0001..0005 + supabase_realtime.sql +
-- storage.sql have been applied. Does NOT assert RLS or seed contents
-- (those live in 99_rls_isolation.sql).

do $$
declare
  required_tables text[] := array[
    'plataformas',
    'carreras',
    'gastos_fijos',
    'gastos_diarios',
    'log_eventos',
    'sync_queue'
  ];
  missing text[] := array[]::text[];
  t text;
begin
  foreach t in array required_tables loop
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = t
    ) then
      missing := array_append(missing, t);
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'Smoke test failed — missing tables: %', array_to_string(missing, ', ');
  end if;

  raise notice 'Smoke test passed — all 6 tables present in public schema.';
end
$$;