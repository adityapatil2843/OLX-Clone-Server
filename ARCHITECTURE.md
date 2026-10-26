# Architecture

## Summary

**Verified:** The repository is a Node.js modular monolith using Express 5, native JavaScript ES modules, PostgreSQL, Prisma 7 with `@prisma/adapter-pg`, and `pg`. The process entry point is `src/server.js`; the testable Express app is `src/app.js`; API v1 is mounted at `/api/v1`.

## Runtime and modules

`src/server.js` validates environment configuration, connects Prisma before listening, starts on `0.0.0.0`, and handles graceful shutdown. `src/app.js` configures Helmet, CORS, JSON/urlencoded bodies (10 MB), Pino HTTP logging, rate limiting, health endpoints, routing, 404 handling, and centralized errors.

Each domain under `src/modules/` generally separates routes, controllers, services, repositories, validation, and constants: auth, users, categories, listings, wishlist, reels, advertisements, chat, and admin/reports. Shared concerns are in `src/middlewares`, `src/config`, `src/db`, and `src/utils`.

## Request flow

```text
HTTP -> Helmet/CORS/body parsing/request logging -> /api rate limit
     -> /api/v1 domain route -> auth/role middleware -> Zod validation
     -> controller -> service -> repository -> Prisma/PostgreSQL
     -> consistent JSON response or centralized error handler
```

Validation uses Zod. Known error mappings include API errors, malformed JSON, Prisma unique conflicts (409), and missing records (404). Development responses may include stacks; production should not.

## Data model

**Verified models:** `User`, `RefreshToken`, `EmailOtp`, `Category`, `Listing`, `ListingMedia`, `Wishlist`, `MediaAsset`, `Reel`, `ReelLike`, `ReelComment`, `SavedReel`, `Advertisement`, `Conversation`, `ConversationParticipant`, `Message`, `Report`, and `AdminAuditLog`. Important relationships include users owning listings/Reels/media, categories grouping listings/Reels, listings having media/wishlists/conversations, and conversations having participants/messages.

## Security and configuration

JWT bearer access tokens are verified in `authenticate`; refresh tokens are persisted for lifecycle/revocation. Role middleware protects admin operations. A development-only identity bypass is fail-closed in production. Helmet, explicit CORS, rate limiting, Zod validation, bcrypt, and centralized error handling are implemented. Environment validation is in `src/config/env.js`; secrets must remain outside documentation and source control.

## Media

**Verified:** `src/modules/reels/reels.storage.js` isolates Cloudinary configuration, signed upload parameters, delivery URLs, deletion, and buffer uploads. Listing media uses the same adapter. Multer keeps uploaded buffers in memory and limits files to 100 MB. Stub responses exist when Cloudinary is unconfigured.

**Not evidenced:** transcoding jobs, durable queueing, CDN policy, virus scanning, retry/cleanup workers, and a complete processing pipeline. Do not describe these as implemented.

## Search, chat, notifications, deployment

Listing location fields and indexes exist. A complete search implementation, cache/Redis integration, Socket.IO transport, notification subsystem, deployment manifests, CI/CD, monitoring/alerts, and backup/restore procedure were not established by this audit. The schema supports chat, reports, ads, and audit records, but persistence and authorization require feature-level verification.

## Limitations and proposed next steps

**Verified limitations:** one test script runs only `tests/marketplace-flows.test.js`; no frontend is present; tracker entries conflict with current implementation in places; `.env.example` currently contains Cloudinary-looking credential values and must be treated as sensitive configuration hygiene risk.

**Proposed:** reconcile `BACKEND_TRACKER.md` with current code, remove credential-like values from the example file, add an explicit test runner for the full suite, then verify search, chat authorization/realtime behavior, notifications, media processing, and deployment/recovery before claiming launch readiness.
