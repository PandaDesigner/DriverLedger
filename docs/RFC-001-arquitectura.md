# RFC-001 — Arquitectura General

## Decisiones

1. **React Native + Expo** (SDK 57+). Angular Native rechazado (alpha, APIs inestables).
2. **Expo UI** para componentes nativos (SwiftUI / Compose primitives).
3. **RxJS Observables** como capa de datos; signals (@preact/signals-react o equivalente) para consumo en UI y evitar re-renders no deseados.
4. **SQLite local (expo-sqlite)** offline-first + **Supabase** como fuente de verdad (RLS, Realtime, logs).
5. **GPS solo durante carreras activas** (expo-task-manager + expo-location). Emite a Subject RxJS.
6. Integraciones: Uber Driver API (OAuth2 cuando aprobada), Waze deep links, DiDi/InDrive con estrategia contextual.
7. Confirmación de un toque en vez de formulario completo (Strategy auto-llena).
8. Tokens y secretos en SecureStore. Nunca en texto plano ni .env en el cliente.

## Alternativas rechazadas

- Angular Native: alpha, no producción.
- Async Storage para datos de negocio: solo para tokens/preferencias.
- Waze API oficial: no disponible para uso personal.
- Formularios largos durante el turno: pérdida de tiempo al volante.

## Consecuencias

- Todo funciona offline; la sync es eventual.
- La UI no conoce la fuente de los datos (manual, api, background).
- Principio abierto/cerrado: agregar plataforma = INSERT en tabla plataformas, no migración.
- Background tasks deben emitir eventos a RxJS Subjects.
