# GitFlow — DriverLedger

Flujo de ramas basado en [GitFlow (nvie)](https://nvie.com/posts/a-successful-git-branching-model/), adaptado a la orquestación multiagente del proyecto.

## Ramas

| Ram | Propósito | Origen | Destino |
|-----|-----------|--------|---------|
| `main` | Producción. Solo código liberado y taggeado. | — | — |
| `develop` | Integración. features listos para release. | `main` | `main` |
| `feature/*` | Trabajo nuevo (una por funcionalidad). | `develop` | `develop` |
| `release/*` | Preparación de release (QA, fixes de último minuto). | `develop` | `main` + `develop` |
| `hotfix/*` | Fix urgente en producción. | `main` | `main` + `develop` |

## Reglas

1. **Nunca commitear directo a `main`.** Todo pasa por `develop` o `release/*`.
2. **Features nacen de `develop`**, no de `main`. Antes de arrancar: `git checkout develop && git pull`.
3. **Una feature = una funcionalidad.** Si crece, partir en sub-features.
4. **Merge a `develop` con `--no-ff`** para preservar la historia de la feature.
5. **Tags en `main`** por release: `v{major}.{minor}.{patch}` (SemVer).
6. **Rebase antes de mergear** una feature a `develop` si develop avanzó.
7. **Conventional commits** en todos los commits (ver abajo).

## Convención de ramas

```
feature/short-descriptive-name
release/v1.0.0
hotfix/v1.0.1
```

Sin mayúsculas, sin espacios, guiones bajos ni caracteres especiales.

## Conventional commits

| Tipo | Uso |
|------|-----|
| `feat:` | Funcionalidad nueva |
| `fix:` | Bug fix |
| `docs:` | Documentación |
| `refactor:` | Refactor sin cambio de comportamiento |
| `test:` | Tests |
| `chore:` | Infra, config, dependencias |

Formato: `<tipo>: <descripción imperativa, minúsculas>`

Ejemplo: `feat: add sync queue for offline trips`

## Ownership por carpetas (sin conflicto con GitFlow)

| Agente | Carpetas |
|---------|----------|
| OpenCode | `data/` `services/` |
| Pi | `ui/` `tests/` |

Las features se asignan según las carpetas que tocan. Si una feature toca carpetas de ambos, se parte en dos features separadas.

## Flujo típico de una feature

```bash
# 1. Arrancar desde develop actualizado
git checkout develop && git pull origin develop

# 2. Crear la feature
git checkout -b feature/sync-queue-offline

# 3. Trabajar y commitear con conventional commits
git add services/sync/
git commit -m "feat: add offline sync queue with retry"

# 4. Antes de mergear, rebase sobre develop
git fetch origin
git rebase origin/develop

# 5. Merge a develop (sin fast-forward)
git checkout develop
git merge --no-f feature/sync-queue-offline

# 6. Pushear
git push origin develop

# 7. Borrar la feature local y remota
git branch -d feature/sync-queue-offline
git push origin --delete feature/sync-queue-offline
```

## Release

```bash
# 1. Crear rama de release
git checkout develop
git checkout -b release/v1.0.0

# 2. Fixes de último momento (solo fix: y docs:)

# 3. Mergear a main y taggear
git checkout main
git merge --no-ff release/v1.0.0
git tag -a v1.0.0 -m "Release v1.0.0"

# 4. Mergear de vuelta a develop
git checkout develop
git merge --no-ff release/v1.0.0

# 5. Pushear todo
git push origin main --tags
git push origin develop

# 6. Borrar rama de release
git branch -d release/v1.0.0
```

## Hotfix

```bash
git checkout main
git checkout -b hotfix/v1.0.1
# ... fix urgente ...
git commit -m "fix: resolve crash on empty trip list"
git checkout main && git merge --no-ff hotfix/v1.0.1
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git checkout develop && git merge --no-ff hotfix/v1.0.1
git push origin main --tags && git push origin develop
```
