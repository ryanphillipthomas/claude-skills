# 2. npm workspace, strict TypeScript, and a short dependency list

- Status: accepted
- Date: 2026-08-11

## Context

The brief asks for an npm workspace of independently testable packages, strict
TypeScript, and few, justified dependencies. It also warns not to turn the
containing repository root into the workspace.

## Decision

The workspace root is `ui-atlas/`, not the repository root. `packages/*` and
`apps/*` are workspaces; each package builds with `tsc -b` through project
references, so a package cannot import another one's internals by accident.

Runtime dependencies, and why each earns its place:

| Dependency   | Why                                                                       |
| ------------ | ------------------------------------------------------------------------- |
| `playwright` | The whole product. Pinned exactly — see ADR 3.                             |
| `zod`        | Every message from page code and every persisted record is schema-checked. Hand-rolled validators for ~40 types would be more code and less trustworthy. |
| `yaml`       | The CLI accepts YAML config and (later) YAML site configs. Small, stable.  |

Dev dependencies: `typescript`, `vitest` (test runner), `esbuild` (bundles the
injected overlay), `@types/node`.

Deliberately *not* added: a CLI argument parser (the surface is small enough to
hand-roll and unit-test), an image library (PNG width/height is read from the
IHDR chunk directly), a logger, and any plugin framework.

Strictness: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`, ESM with
`NodeNext` resolution.

`exactOptionalPropertyTypes` is deliberately **off**. It would force a
conditional-spread dance at every optional field of `CaptureRecord` without
catching a class of bug the schemas do not already catch at the boundary.

## Consequences

- `npm run build` must run before the integration tests: the injected overlay is
  read from `packages/overlay/dist/` at runtime. `pretest` does this.
- Unit and integration tests import package *sources* through Vitest aliases, so
  a stale `dist/` cannot mask a source regression.
- Adding a dependency later should come with a line in this table.
