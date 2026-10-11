# Tasks — setup-supabase-tables

> Branch `feature/setup-supabase-tables` is created by `sdd-apply`, not here. Each task maps to one conventional commit. No AI attribution in commit messages. Cross-domain rule: this change touches ONLY `data/` and `openspec/changes/setup-supabase-tables/`.

## Phase A — Proposal artifacts (this change folder)

- [x] Commit `proposal.md`, `design.md`, `tasks.md`, `specs/data-model/spec.md`, `specs/realtime/spec.md`, `specs/storage/spec.md` to `feature/setup-supabase-tables` as the first commit. Commit type: `docs: propose setup-supabase-tables`.

## Phase B — Schema migrations (one commit per file)

- [x] Write `data/migrations/0001_init_schema.sql` — 6 tables (`plataformas`, `carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`), CHECK constraints, indexes (`carreras(trip_id)` UNIQUE per `driver_id`, `carreras(fecha)`, `sync_queue(estado)`), and the `set_updated_at()` trigger on `carreras`. Commit type: `feat: add init schema migration (setup-supabase-tables)`.
- [x] Write `data/migrations/0002_rls_policies.sql` — driver-scoped RLS template applied to the 5 driver-scoped tables + global SELECT policy on `plataformas`. Commit type: `feat: add rls policies migration (setup-supabase-tables)`.
- [x] Write `data/migrations/0003_seeds.sql` — 3 rows in `plataformas` (Uber 25.00 / uber_api, DiDi 20.00 / didi_manual, InDrive 18.00 / indrive_form) with deterministic UUIDs. Commit type: `feat: add seed data migration (setup-supabase-tables)`.
- [x] Write `data/migrations/supabase_realtime.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE` for `carreras` and `log_eventos` only. Commit type: `feat: add realtime publication migration (setup-supabase-tables)`.
- [x] Write `data/migrations/storage.sql` — buckets `avatares` (public) + `recibos` (private), with path-prefix RLS using `storage.foldername(name)[1] = auth.uid()::text`. Commit type: `feat: add storage buckets migration (setup-supabase-tables)`.

## Phase C — Documentation

- [x] Update `data/README.md` — add the local migration workflow (`supabase db push`), the recommended region (`sa-east-1`), and the two-JWT RLS isolation test recipe. Commit type: `docs: document supabase migration workflow (setup-supabase-tables)`.

## Phase D — Validation SQL (smoke tests consumed by sdd-verify)

- [x] Write `data/migrations/tests/01_smoke.sql` — non-applied helper that asserts the 6 tables exist after migration. Documentation recipe for sdd-verify. Commit type: `test: add smoke recipe (setup-supabase-tables)`.
- [x] Write `data/migrations/tests/99_rls_isolation.sql` — multi-tenant smoke test that asserts a driver-A session cannot SELECT driver-U rows in `carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`. Commit type: `test: add multi-tenant rls isolation recipe (setup-supabase-tables)`.
- [ ] Write `data/migrations/tests/99_realtime_publication_assert.sql` — assert `carreras` and `log_eventos` are in `supabase_realtime` publication; the other 4 tables are not. (Deferred to sdd-verify — see risks.)
- [ ] Write `data/migrations/tests/99_storage_per_driver_rls.sql` — assert driver-A cannot read driver-U's `recibos/<uid>/...` object path; assert driver-A CAN read `avatares/...`. (Deferred to sdd-verify — see risks.)

## Phase E — Verification + merge

- [ ] Run `openspec validate setup-supabase-tables --strict` locally. Must pass.
- [ ] Run `supabase db lint` against `data/migrations/`. Must report 0 errors.
- [ ] Run the three `99_*.sql` smoke tests against a local Supabase instance. All must pass.
- [ ] Human gate 2: OpenCode reviewer approves the PR.
- [ ] Merge `feature/setup-supabase-tables` → `develop` with `--no-ff`.
- [ ] Run `openspec archive setup-supabase-tables` — moves this folder to `openspec/changes/archive/` and promotes the delta specs into `openspec/specs/{data-model,realtime,storage}/spec.md`.