# data/

Supabase migrations, schema SQL, and seed data for the DriverLedger
remote source-of-truth.

- `migrations/` — ordered SQL migrations (`0001_init_schema.sql`,
  `0002_rls_policies.sql`, `0003_seeds.sql`, `supabase_realtime.sql`,
  `storage.sql`)
- `migrations/tests/` — non-applied smoke + RLS isolation recipes run
  manually by `sdd-verify` against the linked project

**Ownership**: OpenCode (`agent/opencode`)

---

## Prerequisites

1. **Supabase CLI** (required):
   ```bash
   brew install supabase/tap/supabase
   supabase --version   # >= 2.0 recommended; tested on 2.58.5
   ```
2. **A Supabase project** — created manually at
   <https://supabase.com/dashboard> before running migrations. The
   project must have:
   - The Email auth provider enabled (Phone, Apple, Google stay
     disabled for now; OAuth is a separate change).
   - The `pgcrypto` extension installed (the `0001` migration tries to
     enable it, but `create extension` requires a privileged user; Supabase
     Cloud enables it by default).
3. **Project reference + DB credentials** — get them from the
   Supabase dashboard under *Project Settings -> API* and *Database*.
   Export locally (do NOT commit):
   ```bash
   export SUPABASE_PROJECT_REF=<the project ref>
   export SUPABASE_DB_URL='postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres'
   ```

## Region

Default recommended region: **`sa-east-1` (São Paulo)** — minimizes RTT
for LATAM drivers (Medellín, Buenos Aires, São Paulo). To pick a
different region, set it in the Supabase dashboard when creating the
project; the migration SQL is region-agnostic.

## Plan tier & free-tier limits

The default plan is **Free**, sufficient for development and personal
pilots. Limits:

| Resource | Free-tier cap |
|-----------|--------------|
| Database | 500 MiB |
| Storage | 1 GiB |
| Bandwidth | 2 GiB / month |
| MAU (auth) | 50,000 / month |
| Realtime | 200 concurrent + 5M messages / month |
| Edge Functions | 500K invocations / month |

Upgrade to **Pro** ($25/month) when any of these caps is hit on
staging or once you onboard a second driver for testing.

## Apply migrations (remote)

```bash
# Link this checkout to your Supabase project (one-time).
supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Push all SQL files in data/migrations/ (NOT under tests/).
supabase db push

# Verify with the manual smoke test.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=on \
  -f data/migrations/tests/01_smoke.sql
```

`supabase db push` does **not** apply files under `tests/`. Those are
documentation recipes run by `sdd-verify` against the linked remote DB.

## Apply migrations (local dev)

For local iteration, spin up the Supabase stack via Docker:

```bash
# One-time: start the local Supabase stack (Postgres, GoTrue, Storage,
# Realtime, Studio). Requires Docker Desktop running.
supabase start

# Reset the local DB to a clean schema; re-runs every migration in order.
supabase db reset

# Stream logs (Realtime, Auth, Storage).
supabase logs
```

The local stack uses the default Supabase project; port 54321 exposes
the Studio UI and 5432 the Postgres port.

## Lint

```bash
supabase db lint   # against data/migrations/
```

Reports 0 errors against the files in this directory.

## Multi-tenant RLS isolation test

`sdd-verify` runs `data/migrations/tests/99_rls_isolation.sql` against
the linked project using two JWTs (driver-A, driver-B). Manual recipe:

1. Create two test users in the Supabase dashboard
   (*Authentication -> Users -> Add user*). Note their UUIDs.
2. Sign in both users via `supabase-js` or the REST endpoint to obtain
   their `access_token` JWTs. Export as `DRIVER_A_JWT`,
   `DRIVER_B_JWT`.
3. Substitute `<DRIVER_A_UUID>` and `<DRIVER_B_UUID>` in
   `99_rls_isolation.sql` with the real UUIDs, then run:
   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=on \
     -f data/migrations/tests/99_rls_isolation.sql
   ```
4. Each impersonation block must report `0` rows for the OTHER driver
   and `1` for the OWN driver.

## Storage buckets

The migration creates two buckets:

| Bucket | Public | Size limit | MIME types | RLS |
|---------|--------|-----------|-----------|-----|
| `avatares` | yes | 2 MiB | `image/png`, `image/jpeg`, `image/webp` | public read; auth write/update/delete |
| `recibos` | no  | 5 MiB | `image/png`, `image/jpeg`, `image/webp`, `application/pdf` | path-prefix `auth.uid()` (per driver) |

The path-prefix policy for `recibos` enforces
`(storage.foldername(name))[1] = auth.uid()::text`, so the driver only
sees files under `recibos/<their-own-uuid>/...`.

## Out of scope

- Client code (Expo + RxJS): belongs to `ui/` (Pi domain).
- OAuth providers (Apple, Google): a separate future change.
- `drivers` profile table: deferred until onboarding ships.
- SQLite mirror schema: a separate change (`local-data-model-sqlite`,
  Phase 1).
- SyncService drain implementation: a separate change
  (`add-sync-queue`, Phase 2).