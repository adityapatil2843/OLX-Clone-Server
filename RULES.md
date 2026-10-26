# Rules for AI Coding Sessions

1. Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PHASE.md](PHASE.md), and [BACKEND_TRACKER.md](BACKEND_TRACKER.md) before coding. Inspect the relevant implementation, tests, migrations, and environment schema first.
2. Treat the repository as the implementation source of truth and approved requirements as the intended-behavior source of truth. When they conflict, document the conflict and ask before redesigning.
3. Preserve the modular-monolith boundaries: routes compose middleware, controllers handle HTTP, services hold business logic, repositories access Prisma, validation owns request schemas, and middleware owns cross-cutting concerns.
4. Use the existing Node.js native ESM/Express/Prisma/Zod/Pino conventions. Reuse existing utilities and dependencies; do not add duplicate abstractions or libraries without a specific justification.
5. Validate all untrusted params, query, body, files, and external-provider responses. Enforce ownership, role checks, valid state transitions, bounded pagination, upload limits, and safe resource usage.
6. Never log tokens, passwords, API keys, private user data, raw authorization headers, or upload contents. Keep development identity bypass disabled in production.
7. Preserve relational integrity and migration compatibility. Never run destructive migrations, modify production data, or change infrastructure without explicit approval and a recovery plan.
8. Handle media through the storage abstraction. Do not expose provider secrets, trust client-owned IDs, or claim transcoding/CDN/processing exists without evidence.
9. Add or update meaningful tests for changed behavior, including negative authorization and validation paths. Run the narrowest relevant checks plus the project test command and report exact results.
10. Make minimal, focused changes. Do not rewrite unrelated modules or claim completion, security, endpoint behavior, or production readiness without verification.
11. Update the relevant documentation/tracker after significant architectural or feature changes, including evidence and remaining uncertainty.
