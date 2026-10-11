-- supabase_realtime.sql
-- Phase 0a (setup-supabase-tables) — Supabase realtime publication scope.
-- Spec: openspec/changes/setup-supabase-tables/specs/realtime/spec.md.
-- Design: openspec/changes/setup-supabase-tables/design.md §1.7.
--
-- Restricts supabase_realtime publication to exactly carreras and
-- log_eventos (cross-device live sync adds UX value there). Other tables
-- (plataformas, gastos_*, sync_queue) are fetched on demand — no realtime.
--
-- Run AFTER 0001 (tables must exist) and BEFORE the app subscribes.

begin;

-- Ensure the publication exists (Supabase ships with it pre-created; this
-- guards against local stack variants where it doesn't).
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

-- Add the two tables that publish realtime events. ALTER PUBLICATION
-- ADD TABLE is idempotent only with FOR ... ALL TABLES; for explicit
-- table lists we guard with a DO block.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'carreras'
  ) then
    alter publication supabase_realtime add table public.carreras;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'log_eventos'
  ) then
    alter publication supabase_realtime add table public.log_eventos;
  end if;
end
$$;

commit;