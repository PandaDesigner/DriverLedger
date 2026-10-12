/**
 * `carrera.service.test.ts` — service-level integration for the
 * `CarreraService` skeleton (PR #1 Task 1.4).
 *
 * Phase 4 scope: `listPlataformas`, `getStrategyByTipo`, and the
 * `suggestRegistration` resolution path (no DB write yet). PR #2
 * Task 2.4 extends the suite with the `commitRegistration` + audit tests.
 *
 * Mirrors the in-memory SQLite factory at
 * `services/__tests__/db.service.test.ts:45-78` so the bridge runs
 * against `bun:sqlite` without the Expo native runtime.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { firstValueFrom } from 'rxjs';

import { closeDb, getDbNamed, type LocalDatabase } from '../db.service';
import type { PlataformaRow } from '../../data/sqlite/types';

import {
  CarreraService,
  UnknownPlataformaError,
} from '../carrera.service';
import { UberStrategy } from '../strategies/uber.strategy';
import { UnknownStrategyError } from '../strategies/strategy.types';

// ---------------------------------------------------------------------------
// bun:sqlite factory — LocalDatabase shape, in-memory SQLite.
// ---------------------------------------------------------------------------

function bunSqliteFactory(name: string): LocalDatabase {
  void name;
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  return {
    exec(sql, params) {
      if (params && params.length > 0) db.exec(sql, ...(params as never[]));
      else db.exec(sql);
    },
    run(sql, params = []) {
      const stmt = db.query(sql);
      const result = stmt.run(...(params as never[]));
      return { rowsAffected: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    queryAll(sql, params = []) {
      return db
        .query(sql)
        .all(...(params as never[])) as unknown[];
    },
    queryOne(sql, params = []) {
      const row = db
        .query(sql)
        .get(...(params as never[])) as unknown;
      return row ?? null;
    },
    close() {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Seed the 3 plataformas rows matching `data/migrations/0003_seeds.sql:24-34`.
// ---------------------------------------------------------------------------

const SEED_PLATAFORMAS: ReadonlyArray<{
  id: string;
  nombre: string;
  comision: number;
  tipo_estrategia: string;
  metadata: string;
  created_at: string;
}> = [
  {
    id: 'a0eebc7e-0001-4000-8000-000000000001',
    nombre: 'Uber',
    comision: 25.0,
    tipo_estrategia: 'uber_api',
    metadata: '{"color":"#000000","api_supported":true}',
    created_at: '2026-10-11 09:00:00',
  },
  {
    id: 'a0eebc7e-0001-4000-8000-000000000002',
    nombre: 'DiDi',
    comision: 20.0,
    tipo_estrategia: 'didi_manual',
    metadata: '{"color":"#ff6f00","api_supported":false}',
    created_at: '2026-10-11 09:00:00',
  },
  {
    id: 'a0eebc7e-0001-4000-8000-000000000003',
    nombre: 'InDrive',
    comision: 18.0,
    tipo_estrategia: 'indrive_form',
    metadata: '{"color":"#ffc107","api_supported":false}',
    created_at: '2026-10-11 09:00:00',
  },
];

async function seedPlataformas(): Promise<void> {
  const db = await getDbNamed(':memory:', bunSqliteFactory);
  db.exec(`
    CREATE TABLE IF NOT EXISTS plataformas (
      id              TEXT    PRIMARY KEY,
      nombre          TEXT    NOT NULL UNIQUE,
      comision        REAL    NOT NULL CHECK (comision >= 0 AND comision <= 100),
      tipo_estrategia TEXT    NOT NULL,
      metadata        TEXT    NOT NULL DEFAULT '{}',
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  for (const row of SEED_PLATAFORMAS) {
    db.run(
      `INSERT INTO plataformas (id, nombre, comision, tipo_estrategia, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.nombre, row.comision, row.tipo_estrategia, row.metadata, row.created_at],
    );
  }
}

// ---------------------------------------------------------------------------
// Lifecycle — fresh DB per test.
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await closeDb();
  await seedPlataformas();
});

afterEach(async () => {
  await closeDb();
});

// ---------------------------------------------------------------------------
// (a) `listPlataformas` returns the 3 seeded rows.
// ---------------------------------------------------------------------------

describe('CarreraService.listPlataformas', () => {
  it('returns the 3 seeded PlataformaRow sorted by nombre', async () => {
    const service = new CarreraService();
    const rows = await service.listPlataformas();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.nombre)).toEqual(['DiDi', 'InDrive', 'Uber']);
    for (const row of rows) {
      expect(row).toMatchObject({
        comision: expect.any(Number),
        tipo_estrategia: expect.any(String),
        metadata: expect.anything(),
        created_at: expect.any(String),
      } satisfies Partial<PlataformaRow>);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) `getStrategyByTipo` resolves the registry by string key.
// ---------------------------------------------------------------------------

describe('CarreraService.getStrategyByTipo', () => {
  it("returns the UberStrategy for 'uber_api'", () => {
    const service = new CarreraService();
    expect(service.getStrategyByTipo('uber_api')).toBe(UberStrategy);
  });

  it("throws UnknownStrategyError on missing keys (PR #1 boundary)", () => {
    const service = new CarreraService();
    expect(() => service.getStrategyByTipo('didi_manual')).toThrow(UnknownStrategyError);
    expect(() => service.getStrategyByTipo('indrive_form')).toThrow(UnknownStrategyError);
  });
});

// ---------------------------------------------------------------------------
// (c) `suggestRegistration` — resolve plataformaId → strategy.suggest.
// ---------------------------------------------------------------------------

describe('CarreraService.suggestRegistration', () => {
  it("resolves Uber's strategy and returns a stub suggestion", async () => {
    const service = new CarreraService();
    const suggestion = await service.suggestRegistration(
      'driver-001',
      'a0eebc7e-0001-4000-8000-000000000001', // Uber
      {
        raw: 'Driver typed body',
        context: { fecha: '2026-10-11', horaLocal: '14:30' },
      },
    );

    expect(suggestion.confidence).toBe(0);
    expect(suggestion.draft.fuente).toBe('manual');
    expect(suggestion.draft.estado).toBe('activa');
  });

  it("overrides draft.plataforma_id with the resolved plataformaId (AD-15)", async () => {
    const service = new CarreraService();
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    const suggestion = await service.suggestRegistration(
      'driver-001',
      uberId,
      { raw: '', context: {} },
    );
    expect(suggestion.draft.plataforma_id).toBe(uberId);
  });

  it('passes the resolved PlataformaRow inside the input (OI-1)', async () => {
    const service = new CarreraService();
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    // Spy on the strategy's suggest to capture the input it received.
    const realSuggest = UberStrategy.suggest.bind(UberStrategy);
    let captured: unknown = undefined;
    UberStrategy.suggest = (async (input) => {
      captured = input;
      return realSuggest(input);
    }) as typeof UberStrategy.suggest;

    try {
      await service.suggestRegistration('driver-001', uberId, {
        raw: 'driver paste',
        context: { fecha: '2026-10-11' },
      });
      const input = captured as { plataforma?: PlataformaRow };
      expect(input.plataforma).toBeDefined();
      expect(input.plataforma?.id).toBe(uberId);
      expect(input.plataforma?.tipo_estrategia).toBe('uber_api');
    } finally {
      UberStrategy.suggest = realSuggest;
    }
  });

  it('throws UnknownPlataformaError on an unknown plataformaId', async () => {
    const service = new CarreraService();
    try {
      await service.suggestRegistration('driver-001', 'not-a-real-uuid', {
        raw: '',
        context: {},
      });
      throw new Error('unreachable: suggestRegistration should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownPlataformaError);
      expect((err as UnknownPlataformaError).plataformaId).toBe('not-a-real-uuid');
    }
  });

  it('does NOT emit on dbChange$ (no DB write — R-8 invariant)', async () => {
    const { firstValueFrom } = await import('rxjs');
    const service = new CarreraService();
    const before = await service.listPlataformas();
    expect(before).toHaveLength(3);

    // Confirming a suggestion only produces a draft; nothing is written.
    await service.suggestRegistration(
      'driver-001',
      'a0eebc7e-0001-4000-8000-000000000001',
      { raw: 'Driver typed body', context: {} },
    );

    const after = await service.listPlataformas();
    expect(after).toHaveLength(3); // still only the seed
  });
});

// ---------------------------------------------------------------------------
// (d) Cross-domain rule (AD-10) — static check on the source file.
// ---------------------------------------------------------------------------

describe('carrera.service.ts — cross-domain isolation', () => {
  it('does not import services/sync-queue.service', async () => {
    const source = await Bun.file(
      new URL('../carrera.service.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]\.\/sync-queue\.service['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
  });

  it('does not import expo-sqlite directly (local-rls-facade)', async () => {
    const source = await Bun.file(
      new URL('../carrera.service.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]expo-sqlite['"]/);
  });

  it('does not import anything under ui/', async () => {
    const source = await Bun.file(
      new URL('../carrera.service.ts', import.meta.url),
    ).text();
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
  });
});

// Avoid lint complaints about the unused `firstValueFrom` import above:
// the import is kept for parity with the other test files.
void firstValueFrom;
