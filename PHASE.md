# Feature Phase Tracker

Statuses: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED`, `DEFERRED`.

| Area | Status | Evidence | Missing / next action |
|---|---|---|---|
| Foundation | VERIFIED | `src/app.js`, `src/server.js`, env validation, health checks, Prisma migrations | Run repeatable clean setup and full test command |
| Authentication | VERIFIED | auth module, JWT middleware, refresh-token model, `tests/auth.test.js` | Verify production configuration and phone OTP decision |
| Profiles | IMPLEMENTED_UNVERIFIED | users module and `User` model | Run ownership/privacy and deactivation tests |
| Categories | IMPLEMENTED_UNVERIFIED | categories module, schema, tests | Verify admin mutations and hierarchy constraints |
| Listings/wishlist | IMPLEMENTED_UNVERIFIED | listings/wishlist modules, schema, tests | Verify all state transitions, media ownership, pagination |
| Reels | IMPLEMENTED_UNVERIFIED | reels module, schema, tests, Cloudinary adapter | Verify processing/publish lifecycle and failure cleanup |
| Video processing | NOT_STARTED | Status fields and upload/confirm endpoints exist | Decide transcoding, thumbnails, queue, retry, and CDN architecture |
| Search/location | NOT_STARTED | Listing location fields/indexes exist | Implement and test keyword/filter/pagination behavior |
| Chat | IMPLEMENTED_UNVERIFIED | conversation/message schema and chat module | Verify persistence, participant authorization, and realtime transport |
| Notifications | NOT_STARTED | No notification model/module found | Define essential records and delivery mechanism |
| Moderation/admin | IMPLEMENTED_UNVERIFIED | reports/admin modules, roles, audit model | Verify privilege boundaries, blocks, transitions, and audit coverage |
| Advertisements | IMPLEMENTED_UNVERIFIED | advertisement model/module | Confirm product scope and authorization/business rules |
| Deployment/operations | IN_PROGRESS | startup, logging, rate limit, health endpoints | Add CI/CD, backup/restore, alerts, security and smoke verification |

Statuses intentionally separate code presence from end-to-end verification. Update the evidence and next action after every meaningful task; do not use completion percentages.
