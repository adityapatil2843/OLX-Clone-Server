# Server Agent Rules & Guidelines

> Inherits universal rules from [../AGENTS.md](../AGENTS.md).

## Rules for Backend Coding Sessions
1. Read `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `PHASE.md`, and `BACKEND_TRACKER.md` before coding. Inspect relevant implementation, tests, migrations, and environment schema first.
2. Treat repository as implementation source of truth and approved requirements as intended-behavior source of truth. Document conflicts before redesigning.
3. Preserve modular-monolith boundaries: routes compose middleware, controllers handle HTTP, services hold business logic, repositories access Prisma, validation owns request schemas, and middleware owns cross-cutting concerns.
4. Use existing Node.js native ESM/Express/Prisma/Zod/Pino conventions. Reuse existing utilities and dependencies; do not add duplicate abstractions.
5. Validate all untrusted params, query, body, files, and external provider responses. Enforce ownership, role checks, valid state transitions, bounded pagination, and upload limits.
6. Never log tokens, passwords, API keys, private user data, raw authorization headers, or upload contents.
7. Preserve relational integrity and migration compatibility. Never run destructive migrations or change infrastructure without explicit approval.
8. Handle media through the storage abstraction. Do not expose provider secrets or trust client-owned IDs.
9. Add or update meaningful tests for changed behavior, including negative authorization and validation paths.
10. Make minimal, focused changes. Do not rewrite unrelated modules.
11. Update relevant documentation and tracker after significant architectural or feature changes.

