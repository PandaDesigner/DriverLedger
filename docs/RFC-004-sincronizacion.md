# RFC-004 — Sincronización

## Flujo

1. Cada carrera / gasto se escribe primero en SQLite.
2. SyncService lo encola en `sync_queue` y lo empuja a Supabase cuando hay conexión.
3. Sin red: permanece en cola.
4. Al reconectar: drenado con backoff exponencial (máximo 5 fallos → pausa).
5. Upsert por `trip_id` (o id equivalente). La versión de la API reemplaza la manual cuando corresponde.
6. Last-write-wins por `updated_at`.

## Reglas

- GPS / coordenadas no se sincronizan (ruido).
- Tokens en SecureStore.
- Realtime de Supabase para cambios remotos (opcional).
- RLS por `driver_id` en todas las tablas.
- Log de eventos también se sincroniza (Supabase gestiona el log).
