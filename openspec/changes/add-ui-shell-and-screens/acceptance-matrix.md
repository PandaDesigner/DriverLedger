# Matriz de aceptación de demostración

Cada estado se activará mediante escenarios deterministas de demostración, no fallos reales de red. El selector de escenarios debe ser visible e identificado como herramienta de demostración. Para cada celda registrar escenario, pasos, resultado y evidencia; esta tabla no significa que la prueba esté ejecutada.

| Superficie       | Estados que deben poder activarse                                                                                 | Evidencia esperada                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| V01 Login        | Inicial, enviando, credenciales inválidas, offline, acceso simulado                                               | Bun del flujo + revisión nativa de errores, foco y aviso demo.                                          |
| V02 Registro     | Validación, enviando, cuenta simulada creada, fallo de red simulado                                               | Bun de validación/flujo + revisión nativa de consentimiento y ausencia de cuenta real.                  |
| V03 Recuperación | Inicial, enviando, envío simulado, cuenta desconocida, offline                                                    | Bun del flujo + texto nativo que aclara que no se envió correo.                                         |
| V04 Onboarding   | Sin plataforma, seleccionada, configuración parcial, completada                                                   | Bun de selección + estado textual de cada plataforma en dispositivo.                                    |
| V05 Dashboard    | Skeleton, sin viajes, carrera activa simulada, meta de ejemplo alcanzada, offline, sync simulado pendiente, error | Fixture identificado + captura/revisión nativa de cada estado y acción siguiente.                       |
| V06 Historial    | Carga, sin historial, vacío filtrado, caché simulada offline, error                                               | Bun de filtros/agrupación + revisión nativa de detalles y limpiar filtros.                              |
| V07 Ajustes      | Guardado simulado, guardando, validación, offline pendiente simulado                                              | Bun de preferencias/reset + revisión nativa; nada persiste fuera de la sesión demo.                     |
| M01 Confirmar    | Preparado, guardando, guardado simulado, conflicto simulado, error                                                | Bun de idempotencia + evidencia nativa de editar/cancelar, sin timeout ni gesto de confirmación oculto. |
| M02 Gasto        | Preparado, validación, guardando, guardado simulado, offline pendiente simulado                                   | Bun de borrador/acciones + dismiss/back/reapertura nativos; descartar explícitamente borra borrador.    |

## Condiciones comunes

Revisar cada superficie en claro/oscuro, tamaño pequeño/grande, portrait/landscape aprobado, texto ampliado, reduced motion y lector de pantalla. Verificar safe areas, teclado, foco, controles de al menos 48pt y mensajes no dependientes solo de color.

Historial debe conservar gastos sin plataforma al filtrar plataforma. La proyección financiera corresponde al rango/plataforma/tipo y versión del escenario. Si no existe proyección compatible, mostrar que no está disponible, también después de mutaciones; nunca reutilizar un total desactualizado.

Verificar imports transitivos y efectos de todas las rutas/componentes: sin red, SQLite, SecureStore, GPS ni acceso a servicios reales; sin almacenamiento o registros de contraseñas. Los campos de contraseña son de prueba y se limpian después del envío. Las pruebas de lógica no sustituyen aceptación nativa ni se reportan como E2E.

Las simulaciones de permiso o conflicto no solicitan permisos del sistema ni resuelven conflictos remotos. Los resultados financieros y las carreras faltantes son ejemplos, no recomendaciones para operar.
