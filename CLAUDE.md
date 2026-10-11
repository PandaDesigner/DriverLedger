# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> DriverLedger está en **fase 0/1 (pre-implementación)**: no hay código fuente todavía. Este archivo documenta la arquitectura planificada a partir de los documentos fuente para mantener alineación mientras se scaffoldea el proyecto.

## Proyecto

App móvil de gestión económica y tiempos al volante para conductores de taxi (Uber, DiDi, InDrive) en Medellín. Meta medible del plan económico: **310–320k COP/día netos** (PRD §1, §8).

## Stack planificado

- **React Native + Expo** (SDK 57+) con **Expo UI** (primitivas SwiftUI/Compose).
- **RxJS Observables** como capa de datos; **signals** para evitar re-renders innecesarios en UI.
- **SQLite offline-first** (`expo-sqlite`) + **Supabase** como fuente de verdad remota (RLS por `driver_id`).
- **GPS solo durante carreras activas** — `expo-task-manager` + `expo-location`, emite a Subject RxJS.
- **Secretos y tokens** en `expo-secure-store` (nunca en `.env` del cliente, nunca en texto plano).

## Arquitectura (resumen operativo)

- **6 tablas**: `plataformas`, `carreras`, `gastos_fijos`, `gastos_diarios`, `log_eventos`, `sync_queue`. JSONB metadata + RLS por `driver_id`. Upserts por `trip_id`. Principio abierto/cerrado: agregar plataforma = `INSERT`, no migración.
- **Strategy** por plataforma (Uber API / DiDi / InDrive). **State** para `AppMode`. Subjects RxJS canónicos: `posicion$`, `carreras$`, `sync$`, `red$`.
- **Sync queue** drenada con backoff exponencial. Last-write-wins por `updated_at`. **GPS no se sincroniza**.
- **Confirmación de un toque**: Strategy auto-llena, conductor confirma con un tap. Nunca formularios largos durante el turno.

## Orquestación multiagente

- **ECC** es el orquestador canónico (instalado en `~/.claude/` user-scope, hooks `minimal`). Regla transversal en `AGENTS.md`.
- **OpenCode** → ownership de `data/` y `services/`. **Pi** → ownership de `ui/` y `tests/`. **Ownership estricto**: un change no cruza dominios — se parte en dos changes.
- **Engram** es la memoria compartida y árbitro de conflictos.
- **Dos puertas humanas obligatorias**: después del plan (`sdd-propose`/`sdd-design`) y antes del commit.

## GitFlow gobernado por OpenSpec

- **Regla de oro**: 1 change OpenSpec = 1 rama `feature/<change>` (mismo nombre).
- Cambios en kebab-case inglés, verbo + sustantivo (`add-sync-queue`, `implement-trip-registration`).
- Specs en formato `SHALL` / `WHEN` / `THEN`, alineadas con `docs/gherkin-modelo-datos.md`.
- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Sin atribución de IA.
- Estados de un change: propuesto → en tareas → validado → archivado (al archivar: merge a `develop` + `openspec archive` actualiza `openspec/specs/`).
- Flujo SDD canónico: `sdd-explore → sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive`.

Detalle completo en `docs/gitflow.md`.

## Orden de lectura obligatoria para nuevos agentes

1. `docs/PRD-consolidado.md` — fuente de verdad de producto.
2. `docs/RFC-001-arquitectura.md` → `docs/RFC-004-sincronizacion.md` — decisiones técnicas.
3. `docs/documento-maestro-agentes.md` — comportamiento de agentes.
4. `docs/documento-prompts.md` — prompts por agente.
5. `docs/gherkin-modelo-datos.md` — escenarios de comportamiento.
6. `openspec/project.md` — governance OpenSpec.
7. `AGENTS.md` — reglas transversales para todo agente.

## Fuentes de verdad (no improvisar)

- **Producto**: `docs/PRD-consolidado.md`.
- **Técnica**: `docs/RFC-001` … `RFC-004`.
- **Governance**: `openspec/project.md` + `docs/gitflow.md`.
- **Comportamiento**: `docs/gherkin-modelo-datos.md`.

Todo cambio debe partir de un change OpenSpec en `openspec/changes/<change>/`, implementado en su rama `feature/<change>` con el flujo SDD completo.

## Estado de implementación

- `data/`, `services/`, `ui/`, `tests/` — carpetas con README de ownership, sin contenido todavía.
- `openspec/specs/` y `openspec/changes/` — vacíos (cero specs vivas, cero changes propuestos).
- `package.json` — no existe. Comandos de build/lint/test se detectarán cuando aterrice el primer `package.json` (fase 0/1).
- `develop` está 3 commits ahead de `main` (governance docs).
- ECC instalado en user-scope global + extensiones locales en `.opencode/`.
- Engram topics activos: `sdd-init/driverledger`, `governance/ecc-stack`, `preferences/voice-style`.
