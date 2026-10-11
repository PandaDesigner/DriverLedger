-- 0002_rls_policies.sql
-- Phase 0a (setup-supabase-tables) — Row-Level Security policies.
-- Source of truth: docs/RFC-002-modelo-datos.md §Reglas + spec
-- openspec/changes/setup-supabase-tables/specs/data-model/spec.md.
-- Design: openspec/changes/setup-supabase-tables/design.md §1.3.
--
-- Enables RLS on the 5 driver-scoped tables and applies the
-- driver_isolation_<table> template: USING (driver_id = auth.uid())
-- plus WITH CHECK on writes. plataformas gets a global-read policy for
-- authenticated users; no INSERT/UPDATE/DELETE policy for authenticated =
-- deny-by-default.

begin;

-- ---------------------------------------------------------------------------
-- Driver-scoped tables: per-RFC-002 RLS-by-driver_id template.
-- ---------------------------------------------------------------------------

-- carreras
alter table public.carreras enable row level security;

drop policy if exists carreras_select_own on public.carreras;
create policy carreras_select_own on public.carreras
  for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists carreras_insert_own on public.carreras;
create policy carreras_insert_own on public.carreras
  for insert to authenticated
  with check (driver_id = auth.uid());

drop policy if exists carreras_update_own on public.carreras;
create policy carreras_update_own on public.carreras
  for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

drop policy if exists carreras_delete_own on public.carreras;
create policy carreras_delete_own on public.carreras
  for delete to authenticated
  using (driver_id = auth.uid());

-- gastos_fijos
alter table public.gastos_fijos enable row level security;

drop policy if exists gastos_fijos_select_own on public.gastos_fijos;
create policy gastos_fijos_select_own on public.gastos_fijos
  for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists gastos_fijos_insert_own on public.gastos_fijos;
create policy gastos_fijos_insert_own on public.gastos_fijos
  for insert to authenticated
  with check (driver_id = auth.uid());

drop policy if exists gastos_fijos_update_own on public.gastos_fijos;
create policy gastos_fijos_update_own on public.gastos_fijos
  for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

drop policy if exists gastos_fijos_delete_own on public.gastos_fijos;
create policy gastos_fijos_delete_own on public.gastos_fijos
  for delete to authenticated
  using (driver_id = auth.uid());

-- gastos_diarios
alter table public.gastos_diarios enable row level security;

drop policy if exists gastos_diarios_select_own on public.gastos_diarios;
create policy gastos_diarios_select_own on public.gastos_diarios
  for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists gastos_diarios_insert_own on public.gastos_diarios;
create policy gastos_diarios_insert_own on public.gastos_diarios
  for insert to authenticated
  with check (driver_id = auth.uid());

drop policy if exists gastos_diarios_update_own on public.gastos_diarios;
create policy gastos_diarios_update_own on public.gastos_diarios
  for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

drop policy if exists gastos_diarios_delete_own on public.gastos_diarios;
create policy gastos_diarios_delete_own on public.gastos_diarios
  for delete to authenticated
  using (driver_id = auth.uid());

-- log_eventos
-- Per proposal Q3 default: clients may insert their own logs.
-- service_role is reserved for system events emitted by Edge Functions
-- in a future change.
alter table public.log_eventos enable row level security;

drop policy if exists log_eventos_select_own on public.log_eventos;
create policy log_eventos_select_own on public.log_eventos
  for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists log_eventos_insert_own on public.log_eventos;
create policy log_eventos_insert_own on public.log_eventos
  for insert to authenticated
  with check (driver_id = auth.uid());

-- No UPDATE/DELETE policy for authenticated clients: log_eventos is
-- append-only from the client's view.

-- sync_queue
-- Driver owns their own queue rows; UPDATE is required for the drain
-- flow (RFC-004 §Flujo 4) where the SyncService transitions
-- pendiente -> procesando -> completado.
alter table public.sync_queue enable row level security;

drop policy if exists sync_queue_select_own on public.sync_queue;
create policy sync_queue_select_own on public.sync_queue
  for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists sync_queue_insert_own on public.sync_queue;
create policy sync_queue_insert_own on public.sync_queue
  for insert to authenticated
  with check (driver_id = auth.uid());

drop policy if exists sync_queue_update_own on public.sync_queue;
create policy sync_queue_update_own on public.sync_queue
  for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

drop policy if exists sync_queue_delete_own on public.sync_queue;
create policy sync_queue_delete_own on public.sync_queue
  for delete to authenticated
  using (driver_id = auth.uid());

-- ---------------------------------------------------------------------------
-- plataformas: global reference data
-- ---------------------------------------------------------------------------
-- RLS is enabled so that authenticated INSERT/UPDATE/DELETE is denied by
-- default; only the global SELECT policy is granted to authenticated.
-- Writes happen via service_role (migrations + future admin RPC).

alter table public.plataformas enable row level security;

drop policy if exists plataformas_select_authenticated on public.plataformas;
create policy plataformas_select_authenticated on public.plataformas
  for select to authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policy for authenticated = deny.
-- service_role bypasses RLS automatically.

commit;