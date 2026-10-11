# Documento Maestro de Agentes — DriverLedger

## 1. Comportamiento (cinco reglas fijas)

1. Publica en Engram qué archivos va a tocar ANTES de escribir.
2. RFCs y PRD son especificación cerrada: si algo no está definido, pregunta en vez de asumir.
3. Corre tests antes de cada commit; si fallan, arregla antes de seguir.
4. Merge a main de un solo carril: rebase, tests, fast-forward; si el rebase falla, aborta y escala a revisión humana.
5. No toca carpetas fuera de su ownership; si necesita algo de otra área, lo publica en Engram como dependencia.

## 2. Scripts (ECC)

- `npx ecc-universal@2.2.3 setup` — instalación guiada
- `npx ecc-universal@2.2.3 doctor` — validar instalación
- `ecc memory init --scope project` — memoria unificada
- `ecc memory handoff --from opencode --target pi` — handoff entre agentes
- Hooks: beforeShellExecution (bloquea git bypass), beforeSubmitPrompt (detecta secretos), beforeTabFileRead (bloquea .env)

## 3. Agentes ECC disponibles

- planner: descompone trabajo en work items
- code-reviewer: revisa correctitud
- security-reviewer: escanea superficie de seguridad
- explorer: solo lectura, investigación

## 4. Diseño (jerarquía visual)

- Un número dominante por pantalla
- Contraste alto (uso al volante)
- Botones de 48pt mínimo
- Modo oscuro para noche en Medellín
- Sin scroll en dashboard

## 5. Flujo de trabajo

- OpenCode: `data/` + `services/` (branch `agent/opencode`)
- Pi: `ui/` + `tests/` (branch `agent/pi`)
- Ownership estricto por carpetas
- Merge: un solo carril
- Dos puertas humanas: después del plan y antes del commit
