# services/

Servicios RxJS, estrategias de plataforma y sincronización.

- `CarreraService.ts` — registro de carreras (`carreras$`)
- `SyncService.ts` — cola `sync_queue`, drenado con backoff
- `LocationService.ts` — `posicion$` desde TaskManager
- `NetworkService.ts` — `red$`
- `strategies/` — UberStrategy, DidiStrategy, InDriveStrategy

**Ownership**: OpenCode (`agent/opencode`)
