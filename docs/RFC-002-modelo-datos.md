# RFC-002 — Modelo de Datos

## Tablas

1. **plataformas**
   - id, nombre, comision, tipo_estrategia, metadata JSONB
   - Permite agregar nuevas plataformas sin migración (abierto/cerrado).

2. **carreras**
   - id, trip_id (UNIQUE), plataforma_id, tarifa_bruta, comision, gasolina, origen, destino, distancia_km, duracion_min, estado, fuente (manual | api | background), created_at, updated_at, metadata JSONB
   - Upsert por trip_id.

3. **gastos_fijos**
   - id, nombre, monto_mensual, activo

4. **gastos_diarios**
   - id, fecha, categoria, monto, metadata JSONB

5. **log_eventos**
   - id, driver_id, tipo, payload JSONB, created_at

6. **sync_queue**
   - id, tabla, registro_id, operacion, intentos, ultimo_intento, estado, metadata JSONB

## Reglas

- RLS por driver_id en todas las tablas.
- Columna `fuente` en carreras para trazabilidad.
- JSONB metadata en tablas extensibles.
- Índices: carreras(trip_id) UNIQUE, carreras(fecha), sync_queue(estado).

## Open-closed

Agregar plataforma nueva (ej. Rappi) = INSERT en plataformas. Las estrategias leen comisión y tipo desde la BD.
