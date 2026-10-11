# RFC-003 — Lógica de Registro

## Strategy

Interfaz común: `registrarCarrera()`, `calcularComision()`, `calcularGasolina()`.

- **UberStrategy**: Uber Driver API (OAuth2) cuando esté disponible. Fallback a confirmación de un toque.
- **DidiStrategy**: suscripción diaria, registro semi-manual.
- **InDriveStrategy**: formulario rápido / confirmación de un toque (sin API).

La Strategy auto-llena datos cuando es posible. El conductor solo confirma con un tap.

## State

AppMode controla el comportamiento según la estrategia activa:

- conectado_uber
- modo_manual
- sin_conexion
- sincronizando
- error

## Observables

- `posicion$`: Subject alimentado por TaskManager (background)
- `carreras$`: BehaviorSubject del día
- `sync$`: estado de la cola
- `red$`: conectividad

## Background (sección 5.4)

- expo-task-manager + expo-location
- La tarea emite coordenadas a `posicion$`
- Operadores RxJS: `filter(carrera activa)`, `scan(distancia acumulada)`
- Android: permiso background + notificación persistente
- iOS: solo durante carreras activas (límites de batería)
- Eventos de background se capturan con RxJS

## Confirmación de un toque (sección 5.5)

Pantalla muestra: plataforma, tarifa, origen, destino, duración, gasolina estimada, comisión, neto.
Un tap confirma. "Editar" abre campos como fallback.
Estados: cargando, confirmación, editando, error.
