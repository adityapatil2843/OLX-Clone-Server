# Project Context

## What this is

Free, India-focused, video-first marketplace backend combining classified listings, vertical Reels, seller profiles, chat, location discovery, notifications, moderation, and admin operations. Core journey: watch → discover → listing → chat → negotiate → connect.

## Confirmed constraints

- Node.js 22-era runtime, Express 5, native ESM, PostgreSQL, Prisma 7 + `@prisma/adapter-pg`, Zod, Pino, JWT/bcrypt, Cloudinary adapter.
- Modular monolith; `/api/v1`; no frontend is present in this repository.
- Do not expose secrets or treat stub media URLs as real delivery.

## Start here

- Requirements: [PRD.md](PRD.md)
- Actual architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- AI rules: [RULES.md](RULES.md)
- Current feature status: [PHASE.md](PHASE.md)
- Existing roadmap/evidence log: [BACKEND_TRACKER.md](BACKEND_TRACKER.md)
- Existing engineering prompt: [ANTI_GRAVITY_SYSTEM_PROMPT.md](ANTI_GRAVITY_SYSTEM_PROMPT.md)

## Current priorities

Reconcile the tracker with the current repository, verify listings/Reels/admin/chat behavior, define search and notifications, and establish media processing and deployment/recovery evidence before launch claims.

## Critical decisions

The project uses a modular monolith and PostgreSQL as the source of truth. Prisma migrations are the schema change path. Cloudinary is isolated behind a storage adapter. PostgreSQL search should be benchmarked before introducing a dedicated search service.

## Known blockers and input needed

Frontend/design source, notification delivery, realtime chat transport, media transcoding/CDN, phone OTP provider, precise-location consent, and final MVP cut line are unresolved. `.env.example` also needs a security-hygiene review because it contains credential-like Cloudinary values.

Before coding, inspect the relevant source and tests, check [PHASE.md](PHASE.md), and report actual verification results.
