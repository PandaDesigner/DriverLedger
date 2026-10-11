# AGENTS.md — DriverLedger

Reglas no negociables para todo agente (ECC, OpenCode, Pi, Claude Code, Cursor, Codex, etc.) que trabaje en este repositorio.

## Regla 1 — ECC es el estándar del proyecto

Todo trabajo de desarrollo en DriverLedger usa **ECC** (Easy Coding Context) como framework de orquestación, junto con todos sus **agentes, skills y plugins** instalados en `.opencode/`.

Esto significa, en concreto:

- **Agentes ECC**: usar los que apliquen al trabajo — `ecc:planner`, `ecc:code-architect`, `ecc:code-explorer`, `ecc:code-reviewer`, `ecc:tdd-guide`, `ecc:architect`, `ecc:tdd-workflow`, `ecc:silent-failure-hunter`, etc.
- **Skills**: cargar la skill relevante con la herramienta `Skill` *antes* de responder o ejecutar (no después de improvisar). Aplica skills de proceso (`superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:test-driven-development`) y de dominio (`ecc:react-native-patterns`, `ecc:supabase-patterns`, etc.).
- **Plugins / MCP servers**: aprovechar los disponibles en la sesión — Engram (memoria persistente), Playwright, Chrome DevTools, y los hooks de ECC en `ecc-hooks.ts`.
- **OpenSpec / SDD**: para cambios nuevos usar el flujo completo — `sdd-explore → sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive` (o comandos equivalentes `opsx-*`). 1 change OpenSpec = 1 rama `feature/<change>` (ver `docs/gitflow.md`).
- **No improvisar**: si una tarea ya tiene un agente ECC dedicado, no se hace a mano. Se delega.
- **Memoria**: las decisiones, bugs fijos y descubrimientos se guardan en Engram con `mem_save` proactivamente.

### Excepciones

- Cambios triviales (typo de una línea, fix de un import) no requieren cargar skill formal, pero la implementación sigue pasando por el agente ECC de `code-reviewer` cuando toca revisión.
- Documentación narrativa pura (este mismo archivo, READMEs sin comportamiento) puede editarse inline.

## Cómo se aplica al llegar a este repo

1. Detectar el proyecto con `mcp__plugin_engram_engram__mem_current_project`.
2. Recuperar contexto previo con `mcp__plugin_engram_engram__mem_context`.
3. Listar mentalmente qué agentes / skills ECC aplican a la solicitud.
4. Cargar la skill correspondiente con la herramienta `Skill` **antes** de proponer código, planes o comandos.
5. Persistir al final de la sesión con `mem_session_summary`.

## Por qué

El usuario eligió ECC como estándar de orquestación y memoria persistente. Saltarse ECC rompe el contexto entre sesiones, el governance OpenSpec y los hooks de seguridad instalados en `.opencode/`.

## Referencias cruzadas

- Documento maestro de comportamiento de agentes: `docs/documento-maestro-agentes.md`
- Prompts concretos por agente: `docs/documento-prompts.md`
- Governance OpenSpec: `openspec/project.md`
- GitFlow integrado con OpenSpec: `docs/gitflow.md`
