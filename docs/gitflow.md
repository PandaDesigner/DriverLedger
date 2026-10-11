# GitFlow + OpenSpec — DriverLedger

El versionado sigue [GitFlow](https://nvie.com/posts/a-successful-git-branching-model/) y está **gobernado por OpenSpec**: ninguna rama de trabajo existe sin un change que la justifique, y ningún change se archiva sin que su rama haya mergeado.

## La regla de oro

> **1 change de OpenSpec = 1 rama feature.**
> El nombre del change ES el nombre de la rama (sin el prefijo).

```
openspec/changes/add-sync-queue/   ↔   feature/add-sync-queue
```

## Ramas permanentes

| Rama | Propósito | Quién escribe |
|------|-----------|---------------|
| `main` | Producción. Solo recibe merges desde `release/*` y `hotfix/*`, con tag SemVer. | Human gate |
| `develop` | Integración. Acumula changes archivados listos para release. | Merge de features |

## Ramas temporales (viven y mueren con su change)

| Rama | Nace de | Muere en | Change OpenSpec |
|------|---------|----------|-----------------|
| `feature/<change>` | `develop` | merge a `develop` + `openspec archive` | `openspec/changes/<change>/` |
| `release/v<x.y.z>` | `develop` | merge a `main` y `develop` | agrupa changes archivados |
| `hotfix/<change>` | `main` | merge a `main` y `develop` + tag patch | change con spec mínimo justificando urgencia |

## Ciclo de vida completo

### 1. Proponer (en `develop`)

```bash
git checkout develop && git pull
```

El agente (o el humano) propone el change con OpenSpec — se generan `proposal.md`, `design.md`, `tasks.md` y los deltas de specs en `openspec/changes/<change>/`.

```bash
openspec validate <change> --strict   # la propuesta debe ser válida ANTES de codificar
```

**Puerta humana 1**: se revisa y aprueba la propuesta antes de crear la rama.

### 2. Crear la rama

```bash
git checkout -b feature/<change>
```

Primer commit de la rama: los artefactos del change.

```bash
git add openspec/changes/<change>
git commit -m "docs: propose <change>"
```

### 3. Implementar

Se trabajan las tasks del `tasks.md` dentro de la rama. Commits con conventional commits, referenciando el change cuando aporta contexto:

```bash
git commit -m "feat: add offline sync queue with retry (<change>)"
```

A medida que se completan tasks, se marcan en `tasks.md` y se commitean junto con el código.

**Restricción de ownership**: si el change toca `data/` o `services/` lo ejecuta OpenCode; si toca `ui/` o `tests/`, lo ejecuta Pi. Un change no mezcla ambos dominios — se parte en dos.

### 4. Verificar (antes del merge)

```bash
openspec validate <change> --strict   # specs coherentes
openspec status <change>              # tasks completadas
# + tests del proyecto
```

**Puerta humana 2**: aprobación del resultado antes de mergear.

### 5. Mergear y archivar

```bash
git checkout develop
git merge --no-ff feature/<change>
openspec archive <change>             # mueve a changes/archive/ y actualiza specs/
git add openspec/
git commit -m "docs: archive <change>"
git push origin develop
git branch -d feature/<change>
```

El archivo del change **es parte del mismo flujo**: `develop` siempre lleva `openspec/specs/` al día con lo que ya está implementado.

### 6. Release

```bash
git checkout -b release/v1.0.0        # desde develop
# bumps de versión, changelog, fixes de último minuto (solo fix/docs)
git checkout main && git merge --no-ff release/v1.0.0
git tag -a v1.0.0 -m "Release v1.0.0"
git checkout develop && git merge --no-ff release/v1.0.0
git push origin main --tags && git push origin develop
git branch -d release/v1.0.0
```

### 7. Hotfix

```bash
git checkout -b hotfix/<change>       # desde main
# change OpenSpec mínimo: proposal + spec del fix
# ... implementar ...
git checkout main && git merge --no-ff hotfix/<change>
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git checkout develop && git merge --no-ff hotfix/<change>
openspec archive <change>
git push origin main --tags && git push origin develop
```

## Estados de un change vs estados de la rama

| Change OpenSpec | Rama git |
|-----------------|----------|
| propuesto (changes/) | `feature/<change>` creada, commits de artefactos |
| tasks en progreso | commits de implementación |
| tasks completas, validado | lista para merge |
| archivado (changes/archive/) | mergeada y borrada |

Si una rama `feature/*` no tiene change correspondiente en `openspec/changes/` o `openspec/changes/archive/`, es una rama huérfana: se corrige o se borra.

## Conventional commits

| Tipo | Uso |
|------|-----|
| `feat:` | Funcionalidad nueva |
| `fix:` | Bug fix |
| `docs:` | Documentación y artefactos OpenSpec |
| `refactor:` | Refactor sin cambio de comportamiento |
| `test:` | Tests |
| `chore:` | Infra, config, dependencias |

Formato: `<tipo>: <descripción imperativa, minúsculas>`

## Comandos de consulta rápida

```bash
openspec list                # changes activos (= features que deberían existir)
openspec list --specs        # specs archivadas (= lo implementado)
openspec view                # dashboard interactivo
openspec status <change>     # progreso de tasks de un change
git branch --list 'feature/*' 'hotfix/*'   # ramas vivas (deben mapear 1:1 con changes activos)
```
