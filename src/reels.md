# OLX-Clone --- Reels Backend Feature Tracker

> **Scope:** Backend only. This document tracks the first working
> version of the Reels feature and the planned path to production
> readiness.
>
> **Source basis:** The uploaded *Free Video-First Marketplace ---
> Developer Requirement Document*, especially sections 4 (Reels), 11 (AI
> and recommendations), 12 (Verification, Safety & Trust), 16--17
> (Technical Architecture and Video Storage), 18 (Core Data Entities),
> 21 (Roadmap), and 23 (Acceptance Checklist).
>
> **Implementation note:** Requirements explicitly stated in the product
> document are separated from proposed engineering choices. Confirm
> choices against the existing repository before implementation.

------------------------------------------------------------------------

## 1. Working strategy

Build a **small, end-to-end Reels slice first**, then extend it safely.
Do not block the first usable version on Users, Admin, Business,
Comments, Likes, Notifications, or Recommendation modules.

### Scope rules

-   [ ] Keep work inside the backend/server project for now.
-   [ ] Inspect the existing repository structure, package scripts,
    Prisma version, database configuration, and conventions before
    adding files.
-   [ ] Build only the Reels-specific schema and code needed for the
    first version.
-   [ ] Use development-only test identity while authentication is not
    implemented; ensure the bypass cannot run in production.
-   [ ] Keep a clear migration path for connecting Reels to Users and
    other modules.
-   [ ] Do not store raw video bytes in PostgreSQL. Store media in
    object storage and persist identifiers/metadata in PostgreSQL.
-   [ ] Do not attempt the complete transcoding/recommendation pipeline
    in the first coding session.

## 2. Product requirements from the uploaded document

The Reels feature is a **first-class product feature**, not merely an
attachment.

### Core Reel capabilities

-   [ ] Create a Reel with caption/description and media metadata.
-   [ ] Support vertical video playback in the future client.
-   [ ] Support video upload through object storage.
-   [ ] Track processing/publication status.
-   [ ] Store category, hashtags, and location metadata.
-   [ ] Allow a Reel to reference a marketplace listing when the
    Listings module exists.
-   [ ] Retrieve a Reel by ID.
-   [ ] Retrieve a paginated feed/list of published Reels.
-   [ ] Update permitted Reel metadata.
-   [ ] Soft-delete/archive a Reel rather than immediately destroying
    its record.
-   [ ] Add reporting/moderation support in a later milestone.
-   [ ] Add likes, comments, saves, follows, and sharing in later
    milestones.
-   [ ] Add adaptive video delivery, multiple resolutions, thumbnails,
    transcoding, and CDN delivery as a later media milestone.
-   [ ] Design for future personalised recommendations using engagement,
    search, listing-view, follow, category, and location signals.

### Product document's wider platform constraints

-   India-first product.
-   Initial languages: English, Hindi, and Marathi; allow additional
    languages later.
-   Normal consumer core usage is intended to be free.
-   Security, moderation, privacy, and legal review remain necessary
    before production.

## 3. Proposed first-version scope

### Include in the first working slice

-   [ ] Prisma `Reel` model and migration.
-   [ ] Reels module structure.
-   [ ] Request validation.
-   [ ] Create, list, get-by-ID, update-metadata, and soft-delete
    endpoints.
-   [ ] Pagination and deterministic sorting.
-   [ ] Media metadata fields and a storage abstraction.
-   [ ] Development-only creator identity for Postman testing.
-   [ ] Centralised error handling and structured logs using the
    project's existing patterns.
-   [ ] Tests for validation, success cases, missing records, invalid
    IDs, and failure cases.
-   [ ] API documentation or a Postman collection.

### Defer until the base slice works

-   [ ] Real authentication and authorisation.
-   [ ] Users/Admin/Business module foreign-key relationships.
-   [ ] Likes, comments, saves, follows, shares, and notifications.
-   [ ] Listing attachment integration.
-   [ ] Full upload signing flow, if not needed for the first local API
    test.
-   [ ] Background transcoding jobs, adaptive streaming, CDN
    configuration, and advanced recommendation ranking.
-   [ ] Advanced analytics, AI moderation, and monetisation.

**Important:** Deferring these features is not permission to expose
unsafe endpoints. Any temporary development bypass must be explicitly
development-only and fail closed in production.

------------------------------------------------------------------------

## 4. Suggested module structure

Use the existing repository's conventions if they already differ. The
following is a target structure, not a claim about files already
present.

``` text
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    └── modules/
        └── reels/
            ├── reels.routes.js
            ├── reels.controller.js
            ├── reels.service.js
            ├── reels.repository.js
            ├── reels.validation.js
            ├── reels.constants.js
            └── __tests__/
                ├── reels.validation.test.js
                ├── reels.service.test.js
                └── reels.routes.test.js
```

### What each file owns

  -----------------------------------------------------------------------
  File                                Responsibility
  ----------------------------------- -----------------------------------
  `reels.routes.js`                   Versioned REST route definitions
                                      and route-level middleware.

  `reels.controller.js`               HTTP request/response handling
                                      only; delegate business logic to
                                      the service.

  `reels.service.js`                  Business rules, status transitions,
                                      ownership checks when identity
                                      integration exists, and
                                      orchestration.

  `reels.repository.js`               Prisma queries and persistence
                                      details. Keep database access out
                                      of controllers.

  `reels.validation.js`               Validate route params, query
                                      params, and request bodies using
                                      the validation library already
                                      selected by the project.

  `reels.constants.js`                Shared status values and
                                      module-specific constants where
                                      useful. Avoid needless constants.

  `__tests__/`                        Focused automated tests. Adapt file
                                      count/layout to the project's
                                      existing test conventions.
  -----------------------------------------------------------------------

**Expected initial module size:** about 6 production files plus tests.
This is a starting point, not a rule. Do not create empty files just to
match the tree. Add a separate media-storage service only when actual
storage integration is implemented.

### Request flow

``` text
HTTP request
  → global middleware (security, request ID, rate limits, errors)
  → reels.routes.js
  → validation middleware
  → reels.controller.js
  → reels.service.js
  → reels.repository.js
  → Prisma / PostgreSQL
```

Media uploads should eventually use a separate storage flow rather than
sending large video bytes through ordinary JSON endpoints.

------------------------------------------------------------------------

## 5. Initial Prisma schema design

### Schema principles

1.  Create the **Reel model only** for the first slice unless the
    current database requires a minimal supporting model.
2.  Use PostgreSQL for structured data and object storage for video
    files.
3.  Store storage keys/object identifiers, not permanent public URLs
    that may later change.
4.  Use an enum or validated status values for lifecycle states.
5.  Include timestamps and a soft-delete marker.
6.  Add indexes that support creator queries, published feed queries,
    and moderation/status filtering.
7.  Do not add fake `User`, `Admin`, or `Business` models merely to
    reserve future relationships.
8.  Review naming and enum conventions against the existing Prisma
    schema before applying a migration.

### Suggested initial fields

  -----------------------------------------------------------------------
  Field                   Suggested type          Purpose
  ----------------------- ----------------------- -----------------------
  `id`                    `String` UUID           Stable Reel identifier.

  `creatorId`             `String`                Temporary creator
                                                  reference; no User
                                                  foreign key in the
                                                  first slice. Require a
                                                  development test
                                                  identity until auth is
                                                  implemented.

  `caption`               `String?`               Reel
                                                  description/caption.

  `videoStorageKey`       `String?` initially, or Object-storage key for
                          required when upload is the video.
                          mandatory               

  `thumbnailStorageKey`   `String?`               Object-storage key for
                                                  the thumbnail.

  `status`                Enum                    Lifecycle such as
                                                  `DRAFT`, `PROCESSING`,
                                                  `PUBLISHED`, `FAILED`,
                                                  `ARCHIVED`. Define only
                                                  states the current
                                                  workflow uses.

  `categoryId`            `String?`               Future category
                                                  integration; plain
                                                  identifier initially if
                                                  Categories is not
                                                  implemented.

  `locationText`          `String?`               Human-readable location
                                                  for initial discovery.
                                                  Structured geo fields
                                                  can be added with
                                                  location search.

  `hashtags`              `String[]` or a related Simple initial hashtag
                          model later             storage; normalise into
                                                  a related model if
                                                  advanced
                                                  search/analytics needs
                                                  it.

  `listingId`             `String?`               Future listing
                                                  reference; no foreign
                                                  key until Listings
                                                  exists.

  `durationMs`            `Int?`                  Video duration in
                                                  milliseconds, if known.

  `width` / `height`      `Int?`                  Video dimensions, if
                                                  known.

  `createdAt`             `DateTime`              Creation timestamp.

  `updatedAt`             `DateTime`              Last update timestamp.

  `deletedAt`             `DateTime?`             Soft deletion/archive
                                                  timestamp; align
                                                  semantics with
                                                  `status`.
  -----------------------------------------------------------------------

### Schema caveats

-   The table above is a proposal, not a copy of an existing
    `schema.prisma`.
-   Choose either `status = ARCHIVED` or `deletedAt` as the canonical
    archive/delete signal and document it. Avoid contradictory states.
-   If media is mandatory to publish, allow draft/processing records
    without a final video key but require a valid processed media asset
    before `PUBLISHED`.
-   Avoid storing both a mutable public URL and a storage key as equally
    authoritative fields.
-   PostgreSQL `String[]` can be adequate for an MVP hashtag list; a
    separate `Hashtag`/join model is more suitable if hashtag analytics,
    moderation, or high-volume search needs become important.
-   Add pagination and indexes based on actual query patterns. Do not
    add speculative indexes without a use case.

### Relationship plan

  ------------------------------------------------------------------------
  Future module            Planned connection      When to implement
  ------------------------ ----------------------- -----------------------
  Users                    `Reel.creatorId`        When Users/auth is
                           becomes a foreign key   implemented.
                           to the canonical user   
                           ID; add ownership       
                           checks.                 

  Admin/moderation         Admin actions and       Before public
                           moderation records      production launch.
                           reference Reel and the  
                           responsible admin/user  
                           identity.               

  Listings                 Optional `listingId`    When Listings is ready.
                           foreign key to a        
                           listing.                

  Categories               Reference canonical     When dynamic categories
                           category/subcategory    are ready.
                           records.                

  Comments                 Comment records         Growth milestone.
                           reference Reel and      
                           creator/user.           

  Likes/saves              Separate interaction    Growth milestone.
                           records with uniqueness 
                           constraints.            

  Follows                  Connect                 Growth milestone.
                           user-to-user/business   
                           relationships and feed  
                           signals.                

  Notifications            Emit events when        After
                           relevant Reel actions   event/notification
                           occur.                  infrastructure exists.

  Search/recommendations   Index Reel metadata and After reliable core
                           consume engagement      data and event capture
                           events.                 exist.

  Media processing         Store processing state, Media pipeline
                           output variants, and    milestone.
                           storage keys; use       
                           jobs/events.            
  ------------------------------------------------------------------------

Do not implement all of these relations now. Keep the future
relationship plan documented and add migrations when the owning modules
are real.

------------------------------------------------------------------------

## 6. API plan

Use the project's versioned API prefix, recommended as `/api/v1`.

  -----------------------------------------------------------------------------------
  Method            Endpoint                  Purpose               Initial status
  ----------------- ------------------------- --------------------- -----------------
  `POST`            `/api/v1/reels`           Create a              Planned
                                              draft/processing Reel 
                                              record.               

  `GET`             `/api/v1/reels`           Paginated Reel        Planned
                                              list/feed; default to 
                                              published records     
                                              when public feed      
                                              behaviour is enabled. 

  `GET`             `/api/v1/reels/:reelId`   Get one Reel by ID.   Planned

  `PATCH`           `/api/v1/reels/:reelId`   Update allowed        Planned
                                              metadata.             

  `DELETE`          `/api/v1/reels/:reelId`   Soft-delete/archive   Planned
                                              according to the      
                                              selected lifecycle    
                                              rule.                 
  -----------------------------------------------------------------------------------

### API rules

-   Validate IDs, query parameters, and request bodies.
-   Enforce pagination limits and stable sorting.
-   Return consistent success and error shapes that match existing
    server conventions.
-   Do not allow clients to set trusted fields such as moderation state,
    creator identity, or publication status arbitrarily.
-   Once auth exists, enforce creator ownership and admin permissions
    server-side.
-   Rate-limit write and upload-initiation endpoints.
-   Do not accept arbitrary remote video URLs and fetch them from the
    server.
-   Never expose storage credentials or secrets.
-   Keep upload signing and final publication validation separate from
    generic metadata updates.

------------------------------------------------------------------------

## 7. Media upload plan

### MVP media lifecycle

``` text
Create Reel record
  → initiate upload / obtain short-lived signed upload permission
  → upload video to object storage
  → confirm upload and validate object metadata
  → processing state
  → (later) transcode / create thumbnail and variants
  → publish only when required media checks pass
  → deliver media through CDN
```

### Checklist

-   [ ] Choose storage provider compatible with the existing project
    (Supabase Storage is an option if already selected).
-   [ ] Keep provider credentials in environment variables.
-   [ ] Keep buckets private by default unless the delivery design
    explicitly requires otherwise.
-   [ ] Use short-lived signed upload/download URLs or an equivalent
    access-controlled design.
-   [ ] Validate file size, declared content type, actual media type,
    and allowed formats.
-   [ ] Generate non-guessable object keys; do not use a user-supplied
    filename as the storage path.
-   [ ] Handle failed, abandoned, and duplicate uploads.
-   [ ] Record storage key and media metadata in PostgreSQL.
-   [ ] Add malware/content checks and moderation before public
    production.
-   [ ] Add asynchronous transcoding, thumbnail generation, adaptive
    streaming, CDN delivery, retention/lifecycle policy, and cost
    monitoring in a later milestone.

Do not claim a video is fully processed just because the object upload
succeeded.

------------------------------------------------------------------------

## 8. Development identity without full auth

The goal is to avoid repetitive Postman login work while building---not
to create a production security hole.

-   [ ] Use one clearly named development-only test creator ID.
-   [ ] Enable the test identity only in an explicit development/test
    environment.
-   [ ] Make application startup fail if the bypass is enabled in
    production.
-   [ ] Keep the identity mechanism behind a small middleware/helper so
    it can be replaced by authenticated identity later.
-   [ ] Do not trust a client-supplied `creatorId` in production.
-   [ ] Add real authentication and ownership checks before public
    deployment.

If this safety gate cannot be implemented confidently, test
service/repository methods directly or use a test-only environment
rather than exposing unauthenticated write routes.

------------------------------------------------------------------------

## 9. Progress tracker

Update this checklist as work is completed. Mark an item done only after
it has been implemented and verified.

### Phase 0 --- Inspect the existing server

-   [ ] Confirm the actual server directory and module conventions.
-   [ ] Inspect `package.json` and existing scripts.
-   [ ] Inspect the current `prisma/schema.prisma` and existing
    migrations.
-   [ ] Confirm Prisma version and PostgreSQL/Supabase connection
    approach.
-   [ ] Confirm current validation, logging, error middleware, and test
    framework.
-   [ ] Record any naming/convention decisions here.

**Exit criteria:** No duplicate setup is created, and the new module
fits the existing architecture.

### Phase 1 --- Prisma model and persistence

-   [ ] Add the minimal `Reel` model.
-   [ ] Add required enums/indexes.
-   [ ] Generate and review the migration.
-   [ ] Apply migration to the intended development database.
-   [ ] Verify Prisma can create and retrieve a test Reel.
-   [ ] Check rollback/recovery expectations before applying migrations
    to shared environments.

**Exit criteria:** Reel records persist and can be queried successfully.

### Phase 2 --- Reels REST API

-   [ ] Add request validation.
-   [ ] Add repository operations.
-   [ ] Add service rules.
-   [ ] Add controller handlers.
-   [ ] Add routes under `/api/v1/reels`.
-   [ ] Add pagination and stable ordering.
-   [ ] Add update allowlists and soft-delete behaviour.
-   [ ] Integrate existing central error handling and structured
    logging.
-   [ ] Test routes with Postman or automated integration tests.

**Exit criteria:** Create, list, get, update, and soft-delete flows work
predictably.

### Phase 3 --- Media foundation

-   [ ] Add storage abstraction.
-   [ ] Configure bucket and environment variables.
-   [ ] Implement signed upload initiation, if in current scope.
-   [ ] Validate upload confirmation and object metadata.
-   [ ] Persist storage keys and processing status.
-   [ ] Verify failure/abandoned upload handling.

**Exit criteria:** The backend tracks uploaded media safely without
storing video bytes in PostgreSQL.

### Phase 4 --- Quality and safety

-   [ ] Test invalid input, missing Reel, duplicate/invalid transitions,
    and database failures.
-   [ ] Test soft-deleted Reel visibility.
-   [ ] Test pagination boundaries and query limits.
-   [ ] Verify the development identity bypass fails closed outside
    development.
-   [ ] Verify no credentials or signed URLs are written to logs.
-   [ ] Verify write endpoints have appropriate rate limits.
-   [ ] Document remaining production gaps.

**Exit criteria:** Core behaviour and failure paths are tested; no
production readiness is claimed prematurely.

### Phase 5 --- Future integrations

-   [ ] Connect Reels to Users/auth with foreign keys and ownership
    checks.
-   [ ] Connect Reels to Listings.
-   [ ] Connect categories and structured location.
-   [ ] Add moderation/admin records and audit trail.
-   [ ] Add likes, comments, saves, and follows.
-   [ ] Add notifications and event processing.
-   [ ] Add transcoding, variants, thumbnails, adaptive streaming, and
    CDN.
-   [ ] Add Reel reporting, blocking, and moderation workflows.
-   [ ] Add recommendation/search integrations and analytics.

**Exit criteria:** Each integration is delivered in its own reviewed
migration and testable milestone.

------------------------------------------------------------------------

## 10. Definition of done for the first Reels backend milestone

The first milestone is complete only when:

-   [ ] Prisma migration is committed and reproducible.
-   [ ] The API can create and retrieve a Reel.
-   [ ] The API can list Reels with validated pagination.
-   [ ] The API can update allowed metadata.
-   [ ] The API can soft-delete/archive a Reel.
-   [ ] Validation errors and missing records return consistent errors.
-   [ ] Automated tests cover the principal success and failure paths.
-   [ ] Video storage credentials are not exposed to clients.
-   [ ] Development-only identity bypass cannot run in production.
-   [ ] README/API usage notes explain local setup and Postman tests.
-   [ ] Deferred work and known limitations are documented.

## 11. Production gaps to keep visible

The first milestone is **not production-ready solely because CRUD
works**. Before public launch, complete and review
authentication/authorisation, upload security, moderation and reporting,
abuse controls, privacy/legal policies, observability, alerting,
backups/recovery, CI/CD, load testing, dependency/security scanning, and
media cost monitoring.

------------------------------------------------------------------------

## 12. Session notes

Use this area to record the current state after each coding session.

-   **Current phase:** Phase 1–3 complete (code); migration pending (network issue)
-   **Session date:** 2026-10-17
-   **Last completed items:**
    -   Phase 0: Inspected all existing conventions (ESM, Express v5, Zod v4, Prisma v7, Pino)
    -   Phase 1: Prisma `Reel` model + enum + indexes written in `schema.prisma`; `prisma generate` ✅; `prisma migrate dev` ❌ blocked by Supabase port 5432 unreachable from this machine
    -   Phase 2: Full Reels REST API built — `reels.constants.js`, `reels.validation.js`, `reels.repository.js`, `reels.service.js`, `reels.controller.js`, `reels.routes.js` — all wired into `app.js`
    -   Phase 3: Cloudinary storage abstraction built in `reels.storage.js`; stubs gracefully if credentials not set
    -   Dev identity middleware built in `middlewares/devCreatorIdentity.js` with prod safety gate
    -   Pino structured logging wired into `app.js`
-   **Current blocker:**
    -   `prisma migrate dev` fails with `P1001` — can't reach Supabase on port 5432
    -   Likely causes: (1) Supabase project paused (check dashboard), (2) firewall blocking port 5432
    -   Resolution: Unblock port 5432, or try from a different network; password is URL-encoded in `.env`
-   **Next concrete task:**
    1.  Fix Supabase connectivity → run `npm run prisma:migrate` → run `npm run dev`
    2.  Test all 7 endpoints in Postman (see API plan §6)
    3.  Add Cloudinary credentials to `.env` for upload signing
-   **Decisions made:**
    -   Cloudinary chosen for video storage (abstraction built, easy to swap)
    -   `DEV_TEST_CREATOR_ID=dev-creator-001` for dev identity bypass
    -   Session pooler URL used for Supabase (`.env` option 2)
    -   No test framework added yet (deferred)
    -   `pino-pretty` install failed (network issue) — app.js falls back gracefully
-   **Known risks:**
    -   Future user/listing relationships must be added through reviewed Prisma migrations
    -   Development identity (`DEV_TEST_CREATOR_ID`) must never be set in production `.env`
    -   Cloudinary `api_secret` must never appear in logs or API responses
