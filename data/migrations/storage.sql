-- storage.sql
-- Phase 0a (setup-supabase-tables) — storage buckets + per-driver RLS.
-- Spec: openspec/changes/setup-supabase-tables/specs/storage/spec.md.
-- Design: openspec/changes/setup-supabase-tables/design.md §1.8.
--
-- Two buckets: avatares (public read, auth write) and recibos (private,
-- path-prefix auth.uid() per driver). Storage policies live on
-- storage.objects and use storage.foldername(name)[1] for the first path
-- segment (= the driver's auth.uid()).
--
-- IMPORTANT: storage.buckets and storage.objects live in the `storage`
-- schema, which Supabase manages. Migrations that touch storage MUST run
-- as a privileged user (the default supabase db push uses the migration
-- role with sufficient privileges in Supabase Cloud). Locally, run via
-- `supabase db reset` or apply against the local stack.

begin;

-- ---------------------------------------------------------------------------
-- Bucket provisioning
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatares', 'avatares', true,
   2097152,  -- 2 MiB
   array['image/png', 'image/jpeg', 'image/webp']),

  ('recibos',  'recibos',  false,
   5242880,  -- 5 MiB
   array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- avatares policies: public SELECT, authenticated INSERT only
-- ---------------------------------------------------------------------------

drop policy if exists avatares_select_public on storage.objects;
create policy avatares_select_public on storage.objects
  for select
  using (bucket_id = 'avatares');

drop policy if exists avatares_insert_auth on storage.objects;
create policy avatares_insert_auth on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares');

drop policy if exists avatares_update_own on storage.objects;
create policy avatares_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares')
  with check (bucket_id = 'avatares');

drop policy if exists avatares_delete_own on storage.objects;
create policy avatares_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares');

-- ---------------------------------------------------------------------------
-- recibos policies: per-driver path-prefix (first path segment = uid)
-- ---------------------------------------------------------------------------

drop policy if exists recibos_select_own on storage.objects;
create policy recibos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_insert_own on storage.objects;
create policy recibos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_update_own on storage.objects;
create policy recibos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_delete_own on storage.objects;
create policy recibos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;