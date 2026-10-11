# DriverLedger

App de gestión económica y tiempos al volante para conductores de taxi (Uber, DiDi, InDrive) en Medellín.

## Stack
- React Native + Expo UI
- RxJS Observables + signals
- SQLite offline-first (expo-sqlite)
- Supabase (fuente de verdad)
- Orquestación multiagente con ECC (Everything Claude Code)

## Estructura del repositorio

```
docs/          # PRD consolidado, RFCs, prompts, Gherkin
data/          # Migraciones Supabase, modelo de datos
services/      # Servicios RxJS, estrategias, sync queue
ui/            # Pantallas Expo UI
tests/         # Tests generados desde Gherkin
```

## Orden de lectura para agentes (OpenCode / Pi)

1. `docs/PRD-consolidado.md` — fuente de verdad
2. `docs/RFC-001-arquitectura.md` a `RFC-004-sincronizacion.md`
3. `docs/documento-maestro-agentes.md` — reglas de comportamiento
4. `docs/documento-prompts.md` — prompts por agente
5. `docs/gherkin-modelo-datos.md` — escenarios de comportamiento

## Agentes y ownership

| Agente   | Carpetas          | Branch           |
|----------|-------------------|------------------|
| OpenCode | `data/` `services/` | `agent/opencode` |
| Pi       | `ui/` `tests/`      | `agent/pi`       |

- Ownership estricto por carpetas
- Merge a `main` de un solo carril: rebase → tests → fast-forward
- Dos puertas humanas: después del plan y antes del commit
- Engram como memoria compartida

## Estado

Proyecto en fase de documentación y setup inicial. Ver `docs/` para especificaciones completas.
