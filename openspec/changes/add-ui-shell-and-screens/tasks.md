# Tareas: add-ui-shell-and-screens

## 1. Puertas y compatibilidad

- [x] 1.1 Validar `openspec/changes/add-ui-shell-and-screens/` y obtener aprobación humana del plan, incluida aceptación de landscape y límites de demostración.
- [x] 1.2 Actualizar develop a origin/develop sin sobrescribir trabajo ajeno, registrar SHA y revisar cambios de fase 4/workspace; crear la rama desde esa base actualizada y commitear solo artefactos aprobados.
- [x] 1.3 Revisar APIs y compatibilidad instaladas de `ui/package.json` y `ui/app.json`; registrar bloqueos y solicitar aprobación antes de cualquier cambio de runtime/dependencias.

## 2. Estado de demostración y pruebas primero

- [x] 2.1 RED: crear `tests/unit/ui-demo.test.ts` para reset, acciones simuladas, confirmación repetida, borradores y ausencia de efectos externos.
- [x] 2.2 GREEN: implementar tipos, fixtures y estado determinista en `ui/src/demo/`, sin credenciales ni datos reales.
- [x] 2.3 RED/GREEN: crear `tests/unit/ui-history.test.ts` y filtros en `ui/src/demo/history.ts` para rango, plataforma, tipo, agrupación y vacío.
- [x] 2.4 RED/GREEN: crear `tests/unit/ui-navigation.test.ts` y validación de rutas/parámetros en `ui/src/demo/navigation.ts`.
- [x] 2.5 REFACTOR: revisar módulos `ui/src/demo/` sin inventar cálculos financieros ni abstracciones de servicios productivos.

## 3. Shell y controles

- [x] 3.1 Crear `ui/src/theme/tokens.ts` y componentes compartidos en `ui/src/components/` con temas, avisos demo y targets de 48pt.
- [x] 3.2 Crear `ui/app/_layout.tsx` y layouts auth/tabs; reemplazar `ui/app/index.tsx` por entrada de demostración.
- [ ] 3.3 Implementar barra única en `ui/src/components/`: Nuevo viaje abre modal; Gastos filtra Historial; back y foco accesibles.
- [ ] 3.4 Ajustar orientación aprobada en `ui/app.json`; comprobar safe areas, teclado y reduced motion.

## 4. Nueve superficies

- [x] 4.1 Crear Login y Registro en `ui/src/screens/` y rutas `(auth)`; validación y resultados explícitamente simulados.
- [x] 4.2 Crear Recuperación y Platforms onboarding en `ui/src/screens/`; ningún correo ni conexión real.
- [x] 4.3 Crear Dashboard con proyecciones identificadas, jerarquía documentada y estados reproducibles.
- [x] 4.4 Crear Historial con filtros, agrupación, detalles inline y acción visible de Alta de gasto.
- [x] 4.5 Crear Ajustes con preferencias solo en memoria y reinicio de demostración.
- [x] 4.6 Crear Confirmación de carrera y ruta `ui/app/modals/confirm-trip.tsx`; un tap deliberado, editar/cancelar e idempotencia.
- [x] 4.7 Crear Alta de gasto y ruta `ui/app/modals/add-expense.tsx`; validación, borrador y feedback simulado.

## 5. Verificación y cierre

- [x] 5.1 Crear `tests/integration/ui-demo-flows.test.ts` para entrada, filtros, modales, error/reintento y offline; comprobar grafo de imports y efectos externos en rutas/componentes, no solo estado demo.
- [ ] 5.2 Configurar tipos/lint para tests raíz; ejecutar UI tsc/lint y Bun con rutas explícitas `tests/unit`, `tests/integration`, `services/__tests__`, `data/sqlite/__tests__`. Definir cobertura de `ui/src/demo/` excluyendo fixtures/contratos y exigir 80% en líneas, funciones, statements y branches.
- [ ] 5.3 Ejecutar `acceptance-matrix.md` y registrar evidencia por superficie/estado en `tests/ui/manual-acceptance.md`: landscape, temas, texto ampliado, lectores de pantalla, cancelación/edición y ausencia de confirmación automática.
- [x] 5.4 Obtener revisión ECC; actualizar `ui/README.md` y crear `verify-report.md` con resultados reales y límites pendientes.
- [ ] 5.5 Solicitar aprobación humana del resultado antes de merge; archivar únicamente después de merge a develop y validación.
