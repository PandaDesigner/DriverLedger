# Aceptación nativa de fase 3

Estado: pendiente. No se han aprobado las nueve superficies en dispositivo.

## Evidencia obtenida

Export iOS y Android completado en `/tmp/driverledger-ui-native-export`. Esto acredita empaquetado, no render ni interacción.

Se arrancó iPhone 17 Pro, iOS 26.5, con Expo Go instalado. Primer intento mediante `exp://127.0.0.1:8091`: captura en `/tmp/driverledger-native-login.png` muestra Expo Go abriendo el proyecto y bundle al 80%, no Login de DriverLedger.

Segundo intento: Metro rechazó combinar offline y localhost; no arrancó. Tercer intento usando solo offline: no registró errores de bundling/runtime, pero la captura excedió 15 segundos; la captura independiente posterior excedió 60 segundos. Sin render confirmado. Metro fue detenido al finalizar cada intento. Los archivos de `/tmp` son evidencia local temporal, no artefactos persistentes de aceptación.

## Matriz pendiente

| Superficie    | Prueba nativa                                               | Resultado                       |
| ------------- | ----------------------------------------------------------- | ------------------------------- |
| Login         | Validación, envío, offline, error y acceso simulado         | No ejecutada satisfactoriamente |
| Registro      | Nombre, consentimiento, error y entrada                     | Pendiente                       |
| Recuperación  | Cuenta desconocida, offline y aviso sin correo real         | Pendiente                       |
| Onboarding    | Ninguna plataforma, parcial y selección                     | Pendiente                       |
| Dashboard     | Meta/KPIs/semana, vacío, activo, offline, pendiente, error  | Pendiente                       |
| Historial     | Rango, plataforma, gastos, detalles y reset                 | Pendiente                       |
| Ajustes       | Preferencias de sesión, temas y reset                       | Pendiente                       |
| Confirmación  | Tap explícito, cancelar, editar, error e idempotencia       | Pendiente                       |
| Alta de gasto | Validación, borrador tras dismiss/back y pendiente simulado | Pendiente                       |

## Pasos para terminar

Arrancar Expo y abrir el proyecto en Expo Go compatible. Recorrer formularios con datos ficticios; comprobar rutas y acciones, no solo capturas. Repetir cada estado de `openspec/changes/add-ui-shell-and-screens/acceptance-matrix.md`.

Revisar iOS y Android, teléfonos pequeños/grandes, portrait/landscape, claro/oscuro, texto ampliado, reduced motion, safe areas y teclado. Comprobar VoiceOver/TalkBack, foco y targets mínimos de 48pt. Adjuntar evidencia y dispositivo/versiones usados por cada fila antes de marcarla aprobada.
