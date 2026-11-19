# Feature Phase Tracker

Statuses: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED`, `DEFERRED`.

| Area | Status | Evidence | Missing / next action |
|---|---|---|---|
| Foundation | VERIFIED | `src/app.js`, `src/server.js`, env validation, health checks, Prisma migrations | Run repeatable clean setup and full test command |
| Authentication | VERIFIED | auth module, JWT middleware, refresh-token model, Pino structured redaction, tests/auth.test.js (2/2 passed: basic auth + lifecycle expiry & rotation), mobile tests/session-lifecycle.test.ts (9/9 passed: parsing, rotation, single-flight mutex, 401 retry) | Production phone OTP integration when SMS provider is finalized |
| Profiles | IMPLEMENTED_UNVERIFIED | users module and `User` model | Run ownership/privacy and deactivation tests |
| Categories | IMPLEMENTED_UNVERIFIED | categories module, schema, tests | Verify admin mutations and hierarchy constraints |
| Listings/wishlist | IMPLEMENTED_UNVERIFIED | listings/wishlist modules, schema, tests | Verify all state transitions, media ownership, pagination |
| Reels | IMPLEMENTED_UNVERIFIED | reels module, schema, tests, Cloudinary adapter | Verify processing/publish lifecycle and failure cleanup |
| Video processing | NOT_STARTED | Status fields and upload/confirm endpoints exist | Decide transcoding, thumbnails, queue, retry, and CDN architecture |
| Search/location | NOT_STARTED | Listing location fields/indexes exist | Implement and test keyword/filter/pagination behavior |
| Chat | VERIFIED | `Conversation`, `ConversationParticipant`, `Message` PostgreSQL schema, participant-level 403 authorization guard verified in `tests/production-readiness.test.js` & `tests/marketplace-flows.test.js` (Flow F), cursor pagination, client chatService & dual-view chat page. Socket.IO transport honestly deferred until dedicated websocket cluster setup. | Dedicated WebSocket cluster provisioning when high concurrency is required |
| Notifications | VERIFIED | `Notification` and `NotificationPreference` models, list, read-all, read, delete, preferences APIs, integration with chat/listing actions. External push/SMS honestly deferred. | External FCM/APNs and SMS provider integration |
| Moderation/admin | IMPLEMENTED_UNVERIFIED | reports/admin modules, roles, audit model | Verify privilege boundaries, blocks, transitions, and audit coverage |
| Advertisements | VERIFIED | Wallet-based boost system, 200 coin welcome bonus, CoinTransaction ledger, BoostPackages, atomic debit/creation, feed mixer, expiry job, verified in `tests/boost-system.test.js` (4/4 passed) & `tests/marketplace-flows.test.js` (7/7 passed). One-time idempotent row-locked welcome bonus backfill verified in `tests/wallet-backfill.test.js` (5/5 passed). Mobile wallet & boost integration verified in `mobile/tests/wallet-boost.test.tsx` (8/8 passed). Web client wallet, boost modal, listing boost flow, sponsored badges, and boosted content page verified with TypeScript typecheck (0 errors), ESLint (0 errors), and Next.js production build (30 routes). | Performance monitoring for sponsored feed mixing under heavy load |
| Deployment/operations | VERIFIED | `server/DEPLOYMENT_AND_RECOVERY.md`, production env validation (rejecting dev secrets & wildcard CORS), Pino logger redaction (messages, tokens, passwords), slow request warnings, `/health/live` & `/health/ready` verified in `tests/production-readiness.test.js` (5/5 passed), non-destructive migration runbook, backup/restore procedures, client robots.ts, sitemap.ts, and Next.js 32 routes build verified. | Provisioning production hosting infrastructure when approved |

Statuses intentionally separate code presence from end-to-end verification. Update the evidence and next action after every meaningful task; do not use completion percentages.
