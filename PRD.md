# Product Requirements

> Status labels: **Verified** = present in repository; **Planned** = stated in approved project materials; **Unknown** = not established by available evidence.

## Vision

**Planned:** A free-to-use, India-focused, video-first marketplace where users can watch, discover, view a listing, chat, negotiate, and connect. Differentiators are classified listings combined with first-class vertical Reels, seller/business profiles, and location-based discovery.

## Users and journeys

**Planned users:** buyers, sellers/businesses, moderators, and administrators. Primary journeys are browse/search → inspect listing or Reel → contact seller → negotiate; seller registration → profile → create listing/Reel → receive messages; moderator/admin → review reports → resolve with an audit trail.

## Functional scope

| Area | Requirement | Repository evidence |
|---|---|---|
| Auth | Email/password JWT access tokens, refresh-token lifecycle, roles | **Verified** routes, middleware, `User`/`RefreshToken`, tests |
| Profiles | User/seller profile read and update | **Verified** user module and model |
| Marketplace | Categories, listings, media, status transitions, wishlist | **Verified** modules, models, tests |
| Reels | Create, upload authorization, confirm, publish states, likes, saves, comments | **Verified** module and models; processing is incomplete |
| Search/location | Keyword/filter discovery with state/city/locality | **Planned**; listing location fields exist, search implementation is not established |
| Chat | Persisted buyer-seller conversations and messages | **Verified** schema/routes exist; realtime delivery is **Unknown/not evidenced** |
| Notifications | Essential notification records/delivery | **Planned**; no notification model/module found |
| Moderation/admin | Reports, role-protected admin operations, audit logs | **Verified** models/routes; workflow coverage requires verification |
| Ads | Commercial campaigns targeting listings/Reels | **Verified** model/module; scope and business rules are **Unknown** |
| Languages | English, Hindi, Marathi initial support | **Planned**; localization implementation is **Unknown** |

## MVP boundary

**Planned:** secure foundation, PostgreSQL/Prisma migrations, auth, profiles, categories/listings, safe media lifecycle, Reels, PostgreSQL search/location, persisted chat, minimum moderation/admin, essential notifications, logging/rate limits, recovery and smoke checks.

**Deferred unless reprioritized:** payments/escrow, paid AI, AI-generated Reels, advanced recommendations, live video/calling, advanced subscriptions/analytics, dedicated search before PostgreSQL benchmarking, advanced automated moderation, and full jobs/services workflows.

## Non-functional requirements

Security, input validation, authorization, secret protection, bounded uploads, consistent errors, structured logs, health/readiness checks, migrations, backward-compatible changes, meaningful tests, and truthful verification are required. Target MVP date in existing project materials is 5 November 2026; feasibility is **Unknown**.

## Acceptance and open questions

Acceptance requires feature-specific tests plus integration/end-to-end verification; file existence alone is insufficient. Open decisions include the frontend/design source, notification delivery mechanism, realtime chat transport, media processing/transcoding/CDN strategy, phone OTP provider, precise location consent, and launch cut line.

See [BACKEND_TRACKER.md](BACKEND_TRACKER.md) for the existing roadmap and verification log.
