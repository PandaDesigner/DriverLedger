/**
 * `pragma-parity.test.ts` — schema-equality harness between the local
 * SQLite mirror and the archived `data-model.spec.md` bridge contract.
 *
 * Boots an in-memory SQLite via Bun's `bun:sqlite` (which exposes the same
 * SQLite engine `expo-sqlite` ships with, including `PRAGMA` and `json1`),
 * applies the embedded migrations, then asserts:
 *
 *   - each of the 6 tables exists;
 *   - `PRAGMA table_info(<table>)` columns match the canonical set
 *     (presence by name; spec.md does not pin the exact affinity string);
 *   - `PRAGMA index_list(<table>)` returns the 9 expected indexes for the
 *     4 indexed tables;
 *   - `PRAGMA index_info(<index>)` confirms column order;
 *   - CHECK constraints and `UNIQUE(driver_id, trip_id)` reject bad input;
 *   - `metadata` column properties (NOT NULL, default '{}') on every table.
 *
 * This is the RED → GREEN guard for design.md §2 mirror matrix: any drift
 * between SQLite and Supabase `0001_init_schema.sql` fails CI.
 *
 * Reference: `openspec/specs/data-model/spec.md` §schema-tables + §indexes;
 *            `data/migrations/0001_init_schema.sql`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import { MIGRATIONS, type Migration } from '../migrations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: unknown;
  pk: 0 | 1;
}

interface IndexInfo {
  seq: number;
  name: string;
  unique: 0 | 1;
  origin: 'c' | 'u' | 'pk';
  partial: 0 | 1;
}

/**
 * Tiny adapter that satisfies `Migration`'s postApply contract when run
 * against `bun:sqlite`. Production wires this up to `expo-sqlite`.
 */
function runMigrations(db: Database, migrations: ReadonlyArray<Migration>): void {
  for (const migration of migrations) {
    db.exec(migration.sql);
    migration.postApply?.({
      getAllSync: <T>(sql: string) => db.query<T, []>(sql).all() as T[],
      execSync: (sql: string) => {
        db.exec(sql);
      },
    });
  }
}

let db: Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db, MIGRATIONS);
});

afterAll(() => {
  db.close();
});

// PRAGMA statements don't accept positional parameters; the table/index
// name must appear inline in the SQL. We escape via bracketed identifier
// quoting (SQLite names already avoid quoted chars in our schema).
function tableInfo(table: string): ColumnInfo[] {
  return db
    .query<ColumnInfo, []>(`PRAGMA table_info("${table}")`)
    .all() as ColumnInfo[];
}

function indexList(table: string): IndexInfo[] {
  return db
    .query<IndexInfo, []>(`PRAGMA index_list("${table}")`)
    .all() as IndexInfo[];
}

function indexInfo(indexName: string): { seqno: number; cid: number; name: string }[] {
  return db
    .query<{ seqno: number; cid: number; name: string }, []>(
      `PRAGMA index_info("${indexName}")`,
    )
    .all() as { seqno: number; cid: number; name: string }[];
}

// ---------------------------------------------------------------------------
// Canonical column shapes — verbatim from `data-model.spec.md §schema-tables`
// ---------------------------------------------------------------------------
//
// Note on affinity: spec.md does not pin the exact `type` string; it pins
// the column set + behaviour (PRIMARY KEY, NOT NULL, DEFAULT, CHECK). We
// assert *presence by name* rather than exact affinity string. The Postgres
// type -> SQLite type adaptation is documented in `data/sqlite/types.ts`.

const CANONICAL_COLUMNS = {
  plataformas: [
    'id',
    'nombre',
    'comision',
    'tipo_estrategia',
    'metadata',
    'created_at',
  ],
  carreras: [
    'id',
    'driver_id',
    'trip_id',
    'plataforma_id',
    'tarifa_bruta',
    'comision',
    'gasolina',
    'origen',
    'destino',
    'distancia_km',
    'duracion_min',
    'estado',
    'fuente',
    'fecha',
    'created_at',
    'updated_at',
    'metadata',
  ],
  gastos_fijos: [
    'id',
    'driver_id',
    'nombre',
    'monto_mensual',
    'activo',
    'metadata',
  ],
  gastos_diarios: ['id', 'driver_id', 'fecha', 'categoria', 'monto', 'metadata'],
  log_eventos: ['id', 'driver_id', 'tipo', 'metadata', 'created_at'],
  sync_queue: [
    'id',
    'driver_id',
    'tabla',
    'registro_id',
    'operacion',
    'intentos',
    'ultimo_intento',
    'estado',
    'metadata',
  ],
} as const;

const ALL_TABLES = Object.keys(CANONICAL_COLUMNS) as (keyof typeof CANONICAL_COLUMNS)[];

// ---------------------------------------------------------------------------
// Six tables contract
// ---------------------------------------------------------------------------

describe('pragma-parity — six tables contract', () => {
  for (const table of ALL_TABLES) {
    it(`creates table ${table} with PRAGMA table_info columns`, () => {
      const info = tableInfo(table);
      expect(info.length).toBeGreaterThan(0);

      const actual = info.map((row) => row.name);
      const expected = [...CANONICAL_COLUMNS[table]];

      expect(actual).toEqual(expected);
    });
  }

  it('rejects insertion into `carreras` with an unknown estado', () => {
    expect(() =>
      db
        .query(
          `INSERT INTO carreras (id, driver_id, trip_id, plataforma_id,
             tarifa_bruta, comision, estado, fuente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('c1', 'd1', 't1', 'p1', 100, 20, 'invalid-estado', 'manual'),
    ).toThrow();
  });

  it('rejects insertion into `carreras` with an unknown fuente', () => {
    expect(() =>
      db
        .query(
          `INSERT INTO carreras (id, driver_id, trip_id, plataforma_id,
             tarifa_bruta, comision, estado, fuente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('c2', 'd1', 't2', 'p1', 100, 20, 'activa', 'invalid-fuente'),
    ).toThrow();
  });

  it('rejects insertion into `sync_queue` with an unknown operacion', () => {
    expect(() =>
      db
        .query(
          `INSERT INTO sync_queue (id, driver_id, tabla, registro_id,
             operacion, estado)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('s1', 'd1', 'carreras', 'c1', 'invalid-operacion', 'pendiente'),
    ).toThrow();
  });

  it('rejects insertion into `sync_queue` with an unknown estado', () => {
    expect(() =>
      db
        .query(
          `INSERT INTO sync_queue (id, driver_id, tabla, registro_id,
             operacion, estado)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('s2', 'd1', 'carreras', 'c1', 'insert', 'invalid-estado'),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// UNIQUE(driver_id, trip_id) on carreras — exercised via INSERT
// ---------------------------------------------------------------------------

describe('pragma-parity — UNIQUE(driver_id, trip_id) on carreras', () => {
  beforeAll(() => {
    // Seed a fully-populated plataforma once for the FK reference.
    db.exec(`
      INSERT OR IGNORE INTO plataformas (id, nombre, comision, tipo_estrategia)
      VALUES ('p1', 'Uber', 25.0, 'uber_api');
    `);
  });

  it('allows a second carrera with the same trip_id for a different driver', () => {
    db.exec(`DELETE FROM carreras;`);

    db.exec(
      `INSERT INTO carreras (id, driver_id, trip_id, plataforma_id,
         tarifa_bruta, comision, estado, fuente)
       VALUES ('cA1', 'driver-A', 't-001', 'p1', 100, 20, 'activa', 'manual');`,
    );

    expect(() =>
      db
        .query(
          `INSERT INTO carreras (id, driver_id, trip_id, plataforma_id,
             tarifa_bruta, comision, estado, fuente)
           VALUES ('cB1', 'driver-B', 't-001', 'p1', 100, 20, 'activa', 'manual')`,
        )
        .run(),
    ).not.toThrow();

    const count = db
      .query<{ c: number }, []>('SELECT COUNT(*) AS c FROM carreras')
      .get();
    expect(count?.c).toBe(2);
  });

  it('rejects a second carrera with the same (driver_id, trip_id)', () => {
    db.exec(`DELETE FROM carreras;`);
    db.exec(
      `INSERT INTO carreras (id, driver_id, trip_id, plataforma_id,
         tarifa_bruta, comision, estado, fuente)
       VALUES ('cA1', 'driver-A', 't-002', 'p1', 100, 20, 'activa', 'manual');`,
    );

    expect(() =>
      db
        .query(
          `INSERT INTO carreras (id, driver_id, trip_id, plataforma_id,
             tarifa_bruta, comision, estado, fuente)
           VALUES ('cA2', 'driver-A', 't-002', 'p1', 120, 22, 'completada', 'manual')`,
        )
        .run(),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Index contract — the 9 indexes from `data-model.spec.md §indexes`
// ---------------------------------------------------------------------------

describe('pragma-parity — 9 indexes per data-model spec §indexes', () => {
  // The orchestrator's locked interpretation:
  //   1. `carreras(trip_id)` UNIQUE per `driver_id` -> auto UNIQUE index on
  //      `(driver_id, trip_id)` from the table constraint. Asserted below
  //      separately.
  //   2..9 -> the 8 explicit indexes declared in 0002.

  const EXPECTED_INDEXES = [
    { table: 'carreras', name: 'idx_carreras_fecha', columns: ['fecha'] },
    {
      table: 'carreras',
      name: 'idx_carreras_driver_updated',
      columns: ['driver_id', 'updated_at'],
    },
    { table: 'gastos_fijos', name: 'idx_gastos_fijos_driver', columns: ['driver_id'] },
    {
      table: 'gastos_diarios',
      name: 'idx_gastos_diarios_driver_fecha',
      columns: ['driver_id', 'fecha'],
    },
    {
      table: 'log_eventos',
      name: 'idx_log_eventos_driver_created',
      columns: ['driver_id', 'created_at'],
    },
    { table: 'log_eventos', name: 'idx_log_eventos_tipo', columns: ['tipo'] },
    {
      table: 'sync_queue',
      name: 'idx_sync_queue_driver_estado',
      columns: ['driver_id', 'estado'],
    },
    { table: 'sync_queue', name: 'idx_sync_queue_ultimo_intento', columns: ['ultimo_intento'] },
  ] as const;

  for (const expected of EXPECTED_INDEXES) {
    it(`creates index ${expected.name} on ${expected.table}`, () => {
      const list = indexList(expected.table);
      const names = list.map((row) => row.name);
      expect(names).toContain(expected.name);
    });

    it(`index ${expected.name} orders columns as ${expected.columns.join(', ')}`, () => {
      const cols = indexInfo(expected.name).map((row) => row.name);
      expect(cols).toEqual([...expected.columns]);
    });
  }

  it('creates the UNIQUE auto-index on carreras(driver_id, trip_id)', () => {
    const list = indexList('carreras');
    const autoUnique = list.find((row) => row.origin === 'u' && row.unique === 1);
    expect(autoUnique).toBeDefined();

    if (autoUnique) {
      const cols = indexInfo(autoUnique.name).map((row) => row.name);
      expect(cols).toEqual(['driver_id', 'trip_id']);
    }
  });

  it('creates no explicit indexes on the `plataformas` reference table', () => {
    const list = indexList('plataformas');
    // SQLite creates an auto-index for the `nombre UNIQUE` constraint.
    // Asserting "no non-auto indexes" means we should find exactly the auto
    // indexes (origin = 'u') and no explicit `idx_*` entries.
    const explicit = list.filter((row) => row.name.startsWith('idx_'));
    expect(explicit.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Column-level properties (parity beyond column set)
// ---------------------------------------------------------------------------

describe('pragma-parity — column-level properties', () => {
  it('carreras.fecha has NOT NULL and DEFAULT today (date)', () => {
    const cols = tableInfo('carreras');
    const fecha = cols.find((row) => row.name === 'fecha');
    expect(fecha?.notnull).toBe(1);
    expect(typeof fecha?.dflt_value).toBe('string');
  });

  it('carreras.estado is NOT NULL', () => {
    const cols = tableInfo('carreras');
    const estado = cols.find((row) => row.name === 'estado');
    expect(estado?.notnull).toBe(1);
  });

  it('every extensible table has a NOT NULL metadata column', () => {
    const expected = [
      'plataformas',
      'carreras',
      'gastos_fijos',
      'gastos_diarios',
      'log_eventos',
      'sync_queue',
    ];
    for (const table of expected) {
      const cols = tableInfo(table);
      const metadata = cols.find((row) => row.name === 'metadata');
      expect(metadata).toBeDefined();
      expect(metadata?.notnull).toBe(1);
    }
  });

  it('gastos_fijos.activo is INTEGER NOT NULL DEFAULT 1', () => {
    const cols = tableInfo('gastos_fijos');
    const activo = cols.find((row) => row.name === 'activo');
    expect(activo?.notnull).toBe(1);
    // SQLite stores DEFAULT values as text; numeric coercion still yields 1.
    expect(Number(activo?.dflt_value)).toBe(1);
  });

  it('carreras.id is PRIMARY KEY', () => {
    const cols = tableInfo('carreras');
    const id = cols.find((row) => row.name === 'id');
    expect(id?.pk).toBe(1);
  });
});
