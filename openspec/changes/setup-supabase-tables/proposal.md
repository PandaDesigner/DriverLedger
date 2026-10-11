# Proposal: setup-supabase-tables

## Intent

Phase 0 of PRD §8: bootstrap the Supabase remote schema (6 tables from RFC-002) with RLS, seeds, auth, realtime, and storage BEFORE any client app lands. Produces the canonical remote source-of-truth that the offline-first SQLite layer will sync against. Doing the remote first means Phase 1 (`local-data-model-sqlite`) and downstream work can reference a stable contract.

## Scope

### In Scope

- `data/migrations/0001_init_schema.sql` — 6 tables + indexes + CHECK constraints
- `data/migrations/0002_rls_policies.sql` — driver-scoped RLS + global read on `plataformas`
- `data/migrations/0003_seeds.sql` — Uber / DiDi / InDrive
- `data/migrations/0004_realtime_publication.sql` — `supabase_realtime` publication for `carreras` + `log_eventos`
- `data/migrations/0005_storage_buckets.sql` — `recibos` (private) + `avatares` (public)
- `data/README.md` — migration workflow + RLS test recipe
- OpenSpec delta specs: `data-model`, `realtime`, `storage`

### Out of Scope

- No client code: no `ui/`, no `services/`, no `tests/`. This is OpenCode's `data/` slice only.
- No SQLite mirror (Phase 1).
- No OAuth providers (Apple/Google) — email + password only.
- No `drivers` profile table — `auth.uid()` is the identity source at this stage.

> **Cross-domain rule**: this change touches ONLY `data/` and `openspec/changes/setup-supabase-tables/`. Never `ui/` or `tests/`. Enforced by `sdd-apply` pre-flight.

## Capabilities

### New Capabilities

- `data-model` — 6-table remote schema, RLS, indexes, CHECK constraints.
- `realtime` — Supabase realtime publication scope (restricted to 2 tables).
- `storage` — `recibos` + `avatares` buckets with per-driver RLS.

### Modified Capabilities

None.

## Approach

`supabase` CLI with plain SQL files in `data/migrations/` (no Prisma, no Drizzle — per user default). Apply the RLS template `USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid())` for driver-scoped tables; `plataformas` is globally readable. Storage uses path-prefix `auth.uid()` for `recibos`. `carreras` carries a `BEFORE UPDATE` trigger for `updated_at` (last-write-wins per RFC-004). Identity source = `auth.uid()` directly (no `drivers` table at this stage). See `design.md` for full SQL snippets.

## Open Questions (non-blocking defaults applied unless review objects)

| # | Question | Default | Alternative |
|---|---------|---------|-------------|
| Q1 | Supabase region? | `sa-east-1` (São Paulo, better LATAM RTT) | `us-east-1` (faster provisioning, +100ms LATAM RTT) |
| Q2 | `carreras` immutability? | Allow UPDATE for upsert reconciliation (Gherkin: "Upsert por trip_id") | Strict insert-only |
| Q3 | `log_eventos` writers? | Client may insert own logs (RLS WITH CHECK) | service_role writes only |
| Q4 | JSONB `metadata` shape? | Schema-less (`'{}'::jsonb` default, no CHECK) | CHECK constraints on shapes |
| Q5 | `updated_at` automation? | DB `BEFORE UPDATE` trigger | Client sets manually |
| Q6 | `gastos_fijos` seed? | Empty seed — driver fills in onboarding | Template monthly-average rows |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RLS leak between drivers | Med | Two-JWT isolation test in `sdd-verify` |
| `service_role` key leaks to bundle | High | Never committed; ECC pre-commit hook; SecureStore only |
| Schema drift SQLite ↔ Supabase | High | `data-model` spec is the contract; Phase 1 mirrors it |
| Realtime cost growth | Low | Scope locked to 2 tables; filter by `driver_id` |
| Free-tier limits (500MB / 50k MAU) | Med | Document Pro upgrade at staging milestone |
| Region latency | Med | `sa-east-1` default; document RTT in `data/README.md` |

## Rollback Plan

Forward-only migrations. To revert, write a follow-up migration that DROPs the created objects (`DROP TABLE`, `DROP POLICY`, `ALTER PUBLICATION ... DROP TABLE`, `DELETE FROM storage.buckets`). Supabase dashboard "Reset database" is also available if no production data exists.

## Dependencies

- Supabase project provisioned by human operator (region, plan tier).
- `supabase` CLI installed locally for `supabase db push`.
- `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` consumed by Phase 0b (`setup-expo-skeleton`).

## Success Criteria

- [ ] `openspec validate setup-supabase-tables --strict` passes.
- [ ] `supabase db lint` reports 0 errors against `data/migrations/`.
- [ ] Two distinct `auth.uid()` sessions cannot SELECT each other's `carreras` rows.
- [ ] `carreras` and `log_eventos` are in `supabase_realtime` publication; other 4 tables are not.
- [ ] Storage objects under `recibos/<driverA_id>/...` are unreadable to driver-B session.
- [ ] `plataformas` returns the 3 seed rows to any authenticated user; INSERT as driver fails.
- [ ] `data/README.md` documents the local workflow and the two-JWT RLS recipe.