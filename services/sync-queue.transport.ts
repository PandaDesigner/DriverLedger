/**
 * `SyncTransport` — port interface for the remote sync backend.
 *
 * The concrete Supabase implementation (`SupabaseSyncTransport`) ships
 * with Fase 5 when OAuth + RLS-bypass secrets land. Until then, the
 * service consumes this port and tests inject `FakeSyncTransport`.
 *
 * Design reference: `openspec/changes/add-sync-queue/design.md §AD-2`.
 * Algorithm reference: `docs/RFC-004-sincronizacion.md §Flujo 4-6`.
 *
 * Cross-domain: this module imports ZERO files from `ui/`. It depends
 * only on the shared `SqliteTable` literal from `data/sqlite/types.ts`.
 */

import type { SqliteTable } from '../data/sqlite/types';

/**
 * Conflict signal returned by `SyncTransport.upsert`.
 *
 * - `'none'` — the remote accepted the write.
 * - `'remote-fresher'` — the remote has a strictly newer `updated_at`
 *   than the local payload; the caller MUST treat the row as
 *   completed-by-loss (log + drop, do not retry). This is the second
 *   line of defence behind the enqueue-time LWW pre-check (AD-7).
 */
export type SyncConflict = 'none' | 'remote-fresher';

/**
 * Snapshot returned by `SyncTransport.read`. The remote may legitimately
 * have no row for a given primary key — `row === null` (and the caller
 * should push the local write). `updated_at` is `null` only when `row`
 * is `null`; otherwise it is the ISO string the remote currently holds.
 */
export interface SyncTransportRead<T = unknown> {
  row: T | null;
  updated_at: string | null;
}

/**
 * Port — three operations, one per RFC-004 mutation kind.
 *
 * Tests provide a `FakeSyncTransport`; Fase 5 provides
 * `SupabaseSyncTransport`. The drain loop never imports either
 * directly — it receives the port through its constructor.
 */
export interface SyncTransport {
  /** Fetch one row from the remote table by primary key. */
  read<T = unknown>(
    table: SqliteTable,
    pk: string,
  ): Promise<SyncTransportRead<T>>;

  /**
   * Apply a local mutation. Returns `conflict: 'remote-fresher'` when
   * the remote has a strictly newer `updated_at` than the local
   * payload — the caller's last-write-wins pre-check should normally
   * catch this, but the return value is the belt-and-suspenders
   * second-line defence (design.md AD-7).
   */
  upsert<T = unknown>(
    table: SqliteTable,
    pk: string,
    payload: T,
    localUpdatedAt: string,
  ): Promise<{ conflict: SyncConflict; remoteUpdatedAt?: string }>;

  /** Delete one row from the remote table by primary key. */
  delete(table: SqliteTable, pk: string): Promise<void>;
}
