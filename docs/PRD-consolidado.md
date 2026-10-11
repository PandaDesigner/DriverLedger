# PRD Consolidado — DriverLedger

## 1. Plan de negocio

- Gastos mensuales aproximados: carro 1.500.000, casa 1.000.000, energía 400.000, gasolina 2.100.000–2.700.000, apps 900.000, comida 540.000, internet 150.000, tarjeta licencia 250.000, seguridad social ~458.000
- Total: ~6.600.000–7.200.000/mes
- Punto de equilibrio: 22–24 carreras/día a ~10.000 COP
- Meta diaria: 310–320k (excluyendo gasolina y app fee ~120k)
- Neto para casa y carro: ~200k diarios
- Horario típico: 12 horas, evitando Lomas y Medellín centro; rutas óptimas Envigado, Belén, Itagüí, El Poblado
- Promedio carrera: 11–17k COP, 15–20 min
- SOAT próximo a vencer; licencia C1 pagada en tarjeta (abono 250k/mes)

## 2. Arquitectura (ver RFC-001)

- React Native + Expo (SDK 57+), Expo UI
- RxJS Observables + signals
- SQLite local offline-first, Supabase fuente de verdad
- GPS solo durante carreras activas (expo-task-manager + expo-location)
- Integraciones: Uber Driver API (cuando aprobada), Waze deep links, DiDi/InDrive semi-manual
- Confirmación de un toque en vez de formulario completo

## 3. Modelo de datos (ver RFC-002)

Seis tablas principales: plataformas, carreras, gastos_fijos, gastos_diarios, log_eventos, sync_queue.
Todas con metadata JSONB. Columna fuente en carreras: manual | api | background.
Upserts por trip_id. RLS por driver_id. Principio abierto/cerrado: agregar plataforma = INSERT, no migración.

## 4. Lógica de registro (ver RFC-003)

- Strategy pattern por plataforma (Uber API, DiDi, InDrive)
- State pattern para AppMode
- Observables: posicion$, carreras$, sync$, red$
- Background GPS emite a Subject RxJS
- Confirmación de un toque: Strategy auto-llena, conductor confirma con un tap

## 5. Sincronización (ver RFC-004)

Cola en sync_queue, drenado con backoff exponencial. Last-write-wins por updated_at. GPS no se sincroniza.

## 6. UI (orden ascendente)

1. Login
2. Registro
3. Olvidar contraseña
4. Onboarding (plataformas)
5. Dashboard (meta diaria, valor acumulado, carreras hechas vs faltantes)
6. Historial
7. Settings

Modales: confirmación de carrera (un toque), alta de gasto.
Principios UX: un número dominante, contraste alto, botones 48pt, modo oscuro, mínima carga cognitiva al volante.

## 7. Multiagentes

- ECC como capa de orquestación (team-agent-orchestration + orch-pipeline)
- OpenCode: data/ + services/
- Pi: ui/ + tests/
- Worktrees aislados, merge de un solo carril
- Engram como memoria compartida y árbitro de conflictos
- Dos puertas humanas: después del plan y antes del commit

## 8. Fases

0. Setup Expo + tablas Supabase
1. Modelo de datos + SQLite
2. Servicios RxJS + sync
3. UI pantallas
4. Estrategias de plataforma
5. Background GPS
6. Integración Uber API (cuando disponible)
7. Tests + pulido
