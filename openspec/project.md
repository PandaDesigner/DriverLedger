# DriverLedger — Project Context

App de gestión económica y tiempos al volante para conductores de taxi (Uber, DiDi, InDrive) en Medellín.

## Stack

- React Native + Expo UI
- RxJS Observables + signals
- SQLite offline-first (expo-sqlite)
- Supabase (fuente de verdad remota)
- Orquestación multiagente con ECC / OpenCode

## Fuente de verdad documental

1. `docs/PRD-consolidado.md` — producto
2. `docs/RFC-001-arquitectura.md` … `RFC-004-sincronizacion.md` — decisiones técnicas
3. `docs/gherkin-modelo-datos.md` — comportamiento
4. `openspec/specs/` — specs vivas (generadas por changes archivados)

## Gobernanza

- **GitFlow integrado con OpenSpec**: ver `docs/gitflow.md`.
- Toda funcionalidad nace como change en `openspec/changes/<change-name>/` y se implementa en la rama `feature/<change-name>`.
- Un change no se archiva hasta que su implementación está mergeada a `develop` y validada.
- Ownership de carpetas: OpenCode → `data/` `services/`; Pi → `ui/` `tests/`.

## Convenciones

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Changes en kebab-case, en inglés, verbo + sustantivo: `add-sync-queue`, `implement-trip-registration`.
- Specs con requisitos en formato SHALL/WHEN/THEN (alineado con Gherkin de `docs/`).
