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

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { firstValueFrom } from 'rxjs';

import { closeDb, getDb, getDbNamed, type LocalDatabase } from '../db.service';
import type { PlataformaRow } from '../../data/sqlite/types';

import {
  CarreraService,
  UnknownPlataformaError,
} from '../carrera.service';
import { UberStrategy } from '../strategies/uber.strategy';
import { UnknownStrategyError } from '../strategies/strategy.types';
import type { PlatformStrategy } from '../strategies/strategy.types';

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

// ---------------------------------------------------------------------------
// (e) `commitRegistration` — write + audit policy (PR #2 Task 2.4).
//
// The audit policy mirrors W-LOG-CONFLICT (`services/sync-queue.service.ts:481-489`):
// a `log_eventos(tipo='carrera.registered')` row is written ONLY on (a)
// below-threshold fallback OR (b) repo error. Happy path emits no audit row.
//
// The service uses `getDb()` from `db.service.ts` for the audit INSERT
// (the only legal write facade per Phase 1 AD-10). The cross-domain
// rule is enforced statically below.
// ---------------------------------------------------------------------------

describe('CarreraService.commitRegistration', () => {
  it('writes one carreras row on the happy path (Uber: tarifa=12500, estado=activa)', async () => {
    const service = new CarreraService();
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    const suggestion = await service.suggestRegistration(
      'driver-001',
      uberId,
      { raw: 'Driver typed body', context: {} },
    );
    // Driver mutates the suggestion (M01 modal behavior) — overwrite
    // tarifa_bruta so the test asserts a non-zero value.
    suggestion.draft.tarifa_bruta = 12500;
    suggestion.draft.origen = 'Calle 10';
    suggestion.draft.destino = 'Centro';
    suggestion.draft.distancia_km = 4.2;
    suggestion.draft.comision = 3125; // 12500 * 0.25
    suggestion.draft.metadata = {};

    const row = await service.commitRegistration('driver-001', suggestion);

    expect(row.driver_id).toBe('driver-001');
    expect(row.plataforma_id).toBe(uberId);
    expect(row.tarifa_bruta).toBe(12500);
    expect(row.estado).toBe('activa');
    expect(row.fuente).toBe('manual');
    expect(row.trip_id).toMatch(/^[0-9a-f-]{36}$/i); // UUID v4 shape
  });

  it('emits NO log_eventos row on the happy path (AD-5 / W-LOG-CONFLICT parity)', async () => {
    // Inject a fake strategy with confidence >= 0.3 (above the threshold)
    // so we exercise the happy-path audit policy. Uber's stub always
    // returns confidence=0; the fake mimics a hypothetical Didi happy
    // path that succeeds with no audit row.
    const highConfidenceStrategy: PlatformStrategy = {
      tipo: 'didi_manual',
      oneTapCapable: false,
      async suggest() {
        return {
          draft: {
            plataforma_id: 'a0eebc7e-0001-4000-8000-000000000002',
            tarifa_bruta: 12500,
            comision: 2500,
            gasolina: 0,
            origen: 'Calle 10',
            destino: 'Centro',
            distancia_km: 4.2,
            duracion_min: null,
            estado: 'completada',
            fuente: 'manual',
            fecha: '2026-10-11',
            metadata: {},
          },
          confidence: 0.9,
          editableFields: ['tarifa_bruta', 'origen', 'destino'],
        };
      },
    };
    const fakeRegistry: Record<string, PlatformStrategy> = {
      didi_manual: highConfidenceStrategy,
    };
    const service = new CarreraService(fakeRegistry);
    const didiId = 'a0eebc7e-0001-4000-8000-000000000002';
    const suggestion = await service.suggestRegistration(
      'driver-001',
      didiId,
      { raw: 'DiDi Tarifa: $12.500 COP\nOrigen: Calle 10\nDestino: Centro', context: {} },
    );
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.3);

    const db = await getDb();
    const before = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_eventos WHERE tipo = 'carrera.registered'",
    );
    await service.commitRegistration('driver-001', suggestion);
    const after = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_eventos WHERE tipo = 'carrera.registered'",
    );
    expect(after?.count ?? 0).toBe(before?.count ?? 0);
  });

  it('emits one log_eventos row on the below-threshold fallback (AD-5)', async () => {
    const service = new CarreraService();
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    // UberStrategy always returns confidence=0 (the stub), so every
    // Uber commit goes through the below-threshold audit path. This
    // is intentional per AD-7 + the Phase 4 stub contract.
    const suggestion = await service.suggestRegistration(
      'driver-001',
      uberId,
      { raw: 'Driver typed body', context: {} },
    );
    suggestion.draft.tarifa_bruta = 12500;
    suggestion.draft.metadata = {};
    expect(suggestion.confidence).toBeLessThan(0.3);

    const db = await getDb();
    const before = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_eventos WHERE tipo = 'carrera.registered'",
    );
    const row = await service.commitRegistration('driver-001', suggestion);
    const after = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_eventos WHERE tipo = 'carrera.registered'",
    );
    expect((after?.count ?? 0) - (before?.count ?? 0)).toBe(1);

    // Audit row content — metadata.fallback === 'manual-form'.
    const audit = db.queryOne<{
      driver_id: string;
      tipo: string;
      metadata: string;
    }>(
      "SELECT driver_id, tipo, metadata FROM log_eventos WHERE tipo = 'carrera.registered' ORDER BY rowid DESC LIMIT 1",
    );
    expect(audit).toBeDefined();
    expect(audit?.driver_id).toBe('driver-001');
    expect(audit?.tipo).toBe('carrera.registered');
    const md = JSON.parse(audit?.metadata ?? '{}') as Record<string, unknown>;
    expect(md.fallback).toBe('manual-form');
    expect(md.plataforma_id).toBe(uberId);
    expect(md.trip_id).toBe(row.trip_id);
  });

  it('emits one log_eventos row AND re-throws on a repo error (AD-5 audit-before-throw)', async () => {
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    const tripId = crypto.randomUUID();
    const failingUpsert = (async () => {
      throw new Error('forced upsert failure');
    });
    const service = new CarreraService(undefined, failingUpsert as never);
    const suggestion: StrategySuggestion = {
      draft: {
        plataforma_id: uberId,
        tarifa_bruta: 12500,
        comision: 0,
        gasolina: 0,
        origen: null,
        destino: null,
        distancia_km: null,
        duracion_min: null,
        estado: 'completada',
        fuente: 'manual',
        fecha: null,
        metadata: {},
      },
      confidence: 0.9, // happy-path confidence so the below-threshold branch does not fire
      editableFields: ['tarifa_bruta'],
    };

    const db = await getDb();
    const before = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_eventos WHERE tipo = 'carrera.registered'",
    );
    let capturedError: Error | null = null;
    try {
      await service.commitRegistration('driver-001', suggestion, tripId);
      throw new Error('unreachable: commitRegistration should have thrown');
    } catch (err) {
      capturedError = err as Error;
    }
    expect(capturedError?.message).toContain('forced upsert failure');

    // Audit row was written BEFORE the throw (AD-5).
    const after = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_eventos WHERE tipo = 'carrera.registered'",
    );
    expect((after?.count ?? 0) - (before?.count ?? 0)).toBe(1);
    const audit = db.queryOne<{ metadata: string }>(
      "SELECT metadata FROM log_eventos WHERE tipo = 'carrera.registered' ORDER BY rowid DESC LIMIT 1",
    );
    const md = JSON.parse(audit?.metadata ?? '{}') as Record<string, unknown>;
    expect(md.error).toBe('forced upsert failure');
    expect(md.plataforma_id).toBe(uberId);
    expect(md.trip_id).toBe(tripId);
  });

  it('audit row driver_id equals the commitRegistration argument', async () => {
    const service = new CarreraService();
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    const suggestion = await service.suggestRegistration(
      'driver-xyz',
      uberId,
      { raw: 'Driver typed body', context: {} },
    );
    suggestion.draft.tarifa_bruta = 12500;
    suggestion.draft.metadata = {};

    await service.commitRegistration('driver-xyz', suggestion);

    const db = await getDb();
    const audit = db.queryOne<{ driver_id: string }>(
      "SELECT driver_id FROM log_eventos WHERE tipo = 'carrera.registered' ORDER BY rowid DESC LIMIT 1",
    );
    expect(audit?.driver_id).toBe('driver-xyz');
  });

  it('audit metadata round-trips through JSON without throwing', async () => {
    const service = new CarreraService();
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    const suggestion = await service.suggestRegistration(
      'driver-001',
      uberId,
      { raw: 'Driver typed body', context: {} },
    );
    suggestion.draft.tarifa_bruta = 12500;
    suggestion.draft.metadata = {};

    await service.commitRegistration('driver-001', suggestion);

    const db = await getDb();
    const audit = db.queryOne<{ metadata: string }>(
      "SELECT metadata FROM log_eventos WHERE tipo = 'carrera.registered' ORDER BY rowid DESC LIMIT 1",
    );
    expect(() => JSON.parse(audit?.metadata ?? '{}')).not.toThrow();
  });

  it('emits dbChange$ on the happy-path write (the repo is the only emitter)', async () => {
    const service = new CarreraService();
    const uberId = 'a0eebc7e-0001-4000-8000-000000000001';
    const suggestion = await service.suggestRegistration(
      'driver-001',
      uberId,
      { raw: 'Driver typed body', context: {} },
    );
    suggestion.draft.tarifa_bruta = 12500;
    suggestion.draft.metadata = {};

    // Subscribe to dbChange$ and assert an upsert event fires.
    const bridge = (await import('../db.service')).getBridge();
    const events: Array<{ kind: string; table: string; rowId: string }> = [];
    const sub = bridge.dbChange$.subscribe((ev) => {
      events.push({ kind: ev.kind, table: ev.table, rowId: ev.rowId });
    });

    try {
      const row = await service.commitRegistration('driver-001', suggestion);
      const matching = events.find(
        (e) => e.table === 'carreras' && e.rowId === row.id,
      );
      expect(matching).toBeDefined();
    } finally {
      sub.unsubscribe();
    }
  });
});

// ---------------------------------------------------------------------------
// (f) `commitRegistration` — cross-domain rule (AD-10) enforced at apply time.
// The static check guards against a future contributor adding the import.
// ---------------------------------------------------------------------------

describe('carrera.service.ts — cross-domain isolation (commitRegistration)', () => {
  it('does not import services/sync-queue.service (R-8 / AD-10)', async () => {
    const source = await Bun.file(
      new URL('../carrera.service.ts', import.meta.url),
    ).text();
    // Strip JSDoc comments + block comments so mentions in docstrings
    // (which are everywhere) don't trip the static check. We anchor
    // the regex with `^` to match real `import` statements only.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/^import\s+.*sync-queue\.service/m);
    expect(code).not.toMatch(/from\s+['"]\.\/sync-queue\.service['"]/);
    expect(code).not.toMatch(/from\s+['"]\.\.\/sync-queue\.service['"]/);
  });
});

// ---------------------------------------------------------------------------
// (g) `PLATFORM_UI_LABELS` — OI-5 value-level cross-domain import.
// ---------------------------------------------------------------------------

describe('services/strategies/ui-labels.ts', () => {
  it('exposes a label for every TipoEstrategia', async () => {
    const { PLATFORM_UI_LABELS } = await import(
      '../strategies/ui-labels'
    );
    expect(PLATFORM_UI_LABELS.uber_api).toBe('Modo API');
    expect(PLATFORM_UI_LABELS.didi_manual).toBe('Modo manual (captura)');
    expect(PLATFORM_UI_LABELS.indrive_form).toBe('Modo formulario');
  });

  it('is Object.freeze-d (no runtime mutation)', async () => {
    const { PLATFORM_UI_LABELS } = await import(
      '../strategies/ui-labels'
    );
    expect(Object.isFrozen(PLATFORM_UI_LABELS)).toBe(true);
  });
});
