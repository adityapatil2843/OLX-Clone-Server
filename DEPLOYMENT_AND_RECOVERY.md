# Bazarr 360 - Deployment, Database Safety & Disaster Recovery SOP

> **Brand:** Bazarr 360  
> **Production Web Domain:** https://bazarr360.in  
> **Production API Base:** https://api.bazarr360.in/api/v1  
> **Authoritative Database:** PostgreSQL (Supabase / Managed PostgreSQL) with Prisma ORM 7  
> **Document Purpose:** Operational runbook for reliable production deployment, observability, non-destructive migrations, backup/restore procedures, and disaster recovery.

---

## 1. Production Configuration & Environment

### Environment Variables Matrix

| Variable | Environment | Sensitivity | Description & Validation Rules |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | All | Public | `production`, `development`, or `test`. Production activates strict security rules. |
| `PORT` | Server | Public | Port on which the HTTP service listens (default: `5000` or assigned by container orchestrator). |
| `DATABASE_URL` | Server | **High Secret** | Pooled PostgreSQL connection string for Prisma ORM (`postgresql://...`). Never commit or log. |
| `DIRECT_URL` / `DIRECT_DATABASE_URL` | Server | **High Secret** | Direct PostgreSQL connection string for Prisma CLI migrations (`npx prisma migrate deploy`). |
| `CORS_ORIGIN` | Server | Config | Comma-delimited list of allowed production client origins (e.g. `https://bazarr360.in`). **Wildcard (`*`) is strictly rejected in production.** |
| `LOG_LEVEL` | Server | Config | `info`, `warn`, `error`, `fatal`. Default is `info` in production. |
| `JWT_ACCESS_SECRET` | Server | **High Secret** | Secret key for signing access tokens. In production: **must be at least 32 characters and cannot contain dev default phrases**. |
| `JWT_REFRESH_SECRET` | Server | **High Secret** | Secret key for signing refresh tokens. In production: **must be at least 32 characters and cannot contain dev default phrases**. |
| `JWT_ACCESS_EXPIRES_IN` | Server | Config | Access token lifetime (e.g., `15m`). |
| `JWT_REFRESH_EXPIRES_IN` | Server | Config | Refresh token lifetime (e.g., `7d`). |
| `BCRYPT_SALT_ROUNDS` | Server | Config | Salt rounds for password hashing (`10` - `12`). |
| `RATE_LIMIT_WINDOW_MS` | Server | Config | API rate limit sliding window in ms (default: `900000` = 15m). |
| `RATE_LIMIT_MAX` | Server | Config | Maximum allowed requests per IP per window (default: `300`). |
| `CLOUDINARY_CLOUD_NAME` | Server | Config | Cloudinary cloud identifier for signed upload signature generation. |
| `CLOUDINARY_API_KEY` | Server | Config | Cloudinary public API key. |
| `CLOUDINARY_API_SECRET` | Server | **High Secret** | Cloudinary private secret. Used exclusively on server to sign upload tokens. Never send to client. |
| `NEXT_PUBLIC_APP_NAME` | Client | Public | Display brand name (`Bazarr 360`). |
| `NEXT_PUBLIC_APP_URL` | Client | Public | Canonical web URL (`https://bazarr360.in`). |
| `NEXT_PUBLIC_API_BASE_URL` | Client | Public | Production backend API endpoint (`https://api.bazarr360.in/api/v1`). |

### Fail-Fast Startup Validation
The backend uses Zod runtime environment validation (`src/config/env.js`). If any required variable is missing or if production runs with insecure secrets or wildcard CORS, the process logs a structured error and immediately terminates with exit code 1.

---

## 2. Server Deployment & Process Management

### Startup Command
```bash
# Production container entrypoint
npm run start
```
Executes `node src/server.js`. The server binds to `0.0.0.0:${PORT}` and performs a database connectivity test before opening the HTTP port.

### Graceful Shutdown SOP
When the process receives `SIGTERM` or `SIGINT` (e.g., during rolling zero-downtime updates or container rescheduling):
1. Stops accepting new incoming HTTP connections (`server.close()`).
2. Allows in-flight requests to complete up to a 10-second drain window.
3. Disconnects Prisma database connection pool (`await prisma.$disconnect()`).
4. Exits cleanly with status code `0`.
5. If in-flight requests do not drain within 10 seconds, forcefully exits with status code `1` to prevent container zombie hangs.

---

## 3. Observability & Health Checks

### Endpoints

| Endpoint | Method | Expected HTTP Status | Description |
| :--- | :--- | :--- | :--- |
| `/health/live` | GET | `200 OK` | Liveness probe. Confirms Express HTTP process is awake and answering. |
| `/health/ready` | GET | `200 OK` or `503 Service Unavailable` | Readiness probe. Executes `SELECT 1` via Prisma. Returns `503` if database is down. |
| `/health` | GET | `200 OK` | Legacy/generic load balancer health check. |

### Health Check Response Schema
```json
{
  "status": "ready",
  "database": "connected",
  "timestamp": "2026-11-18T10:15:00.000Z"
}
```
If the database connection fails:
```json
{
  "status": "not_ready",
  "database": "disconnected",
  "error": "Database connection refused",
  "timestamp": "2026-11-18T10:15:00.000Z"
}
```

### Logging & Error Redaction Rules
- **Structured JSON Logging:** Pino emits structured JSON with timestamps, process IDs, and request correlation IDs (`x-request-id`).
- **Redaction Policy:** Strict redaction removes:
  - `req.headers.authorization`
  - `req.headers.cookie`
  - `res.headers["set-cookie"]`
  - `req.body.password`, `req.body.newPassword`
  - `req.body.token`, `req.body.accessToken`, `req.body.refreshToken`
  - `req.body.otp`
  - `req.body.content` (private buyer-seller messages)
  - `req.body.phone`, `req.body.contactPhone`
  - `req.body.text` (reel comments)
  - Database URLs and Cloudinary API secrets
- **Slow Request Visibility:** Requests taking longer than 1000ms are automatically flagged at `warn` log level with response duration.
- **Client Error Masking:** In production (`NODE_ENV=production`), all internal 500 errors return sanitized user-facing messages. Internal stack traces and database constraint names are never exposed in HTTP responses.

---

## 4. Database Safety & Migration Procedures

### Strict Forbidden Database Operations
The following commands are **strictly prohibited** in staging and production environments:
- ❌ `npx prisma migrate reset` (Drops the entire database and erases all records)
- ❌ `npx prisma db push --force-reset` (Drops tables with schema divergences)
- ❌ `DROP TABLE`, `DROP DATABASE`, `TRUNCATE TABLE`
- ❌ Untracked manual SQL schema mutations directly in production databases

### Safe Migration Runbook
All schema modifications must follow the **Non-Destructive Additive Pattern**:
1. **Migration Authoring (Local Development):**
   ```bash
   # In development only
   npx prisma migrate dev --name <descriptive_additive_change>
   ```
2. **Backward Compatibility Rule:**
   - New columns must be either `nullable` or have a safe `@default(...)`.
   - Renaming columns or deleting columns in a single deploy is forbidden. Follow the expand-contract pattern:
     - Phase A (Expand): Add new column, backfill data, make app read from new column and write to both.
     - Phase B (Contract): Deprecate old column and remove in subsequent release after verification.
3. **Pre-Deployment Migration Run:**
   Before releasing new container images or web workers, execute:
   ```bash
   # Production migration deployment using DIRECT_URL
   npx prisma migrate deploy
   ```
4. **Verification:**
   Check migration status with:
   ```bash
   npx prisma migrate status
   ```
   If unapplied migrations exist, resolve them before allowing application traffic.

---

## 5. Backup & Disaster Recovery Procedures

### Automated Backup Policy
- **Full Daily Snapshot:** Taken every 24 hours at 02:00 UTC using `pg_dump`.
- **Retention Period:** 30 days of daily backups stored in immutable, geo-replicated object storage (e.g., AWS S3 Glacier / Cloudflare R2 with Object Lock).
- **Point-in-Time Recovery (PITR):** Continuous Write-Ahead Log (WAL) archiving enabled on managed PostgreSQL instance allowing recovery up to the minute of failure.

### Manual Backup Command
```bash
# Generate encrypted, compressed custom format backup
pg_dump --format=custom \
        --no-owner \
        --no-privileges \
        --dbname="$DIRECT_DATABASE_URL" \
        --file="bazarr360_backup_$(date +%Y%m%d_%H%M%S).dump"
```

### Recovery Drill & Restoration SOP
In the event of database corruption or hardware disaster:
1. Provision target clean PostgreSQL instance.
2. Ensure no application servers are actively writing to the database (put client into maintenance mode if necessary).
3. Restore the latest clean dump:
   ```bash
   pg_restore --clean \
              --if-exists \
              --no-owner \
              --no-privileges \
              --dbname="$TARGET_DATABASE_URL" \
              "bazarr360_backup_latest.dump"
   ```
4. Run Prisma schema validation and migration check:
   ```bash
   npx prisma migrate status
   ```
5. Verify core table counts and relational integrity:
   ```sql
   SELECT count(*) FROM "User";
   SELECT count(*) FROM "Listing";
   SELECT count(*) FROM "Reel";
   SELECT count(*) FROM "CoinTransaction";
   SELECT count(*) FROM "Advertisement";
   ```
6. Direct application traffic back to the restored instance and verify `/health/ready`.

---

## 6. Functional Boundaries & Honest System Limitations

### Chat Reliability & Transport Boundary
- **Implemented & Authoritative:**
  - Persisted relational buyer-seller chat (`Conversation`, `ConversationParticipant`, `Message`).
  - Strict participant-level authorization checks on all operations (403 Forbidden for non-participants).
  - Cursor-based message history pagination (`?cursor=...&limit=...`).
  - Rate limiting on message creation.
- **Deferred Transport:**
  - Socket.IO realtime WebSocket clustering is deferred until dedicated distributed websocket infrastructure (Redis pub/sub or socket cluster) is provisioned. Current client polls or refreshes on message dispatch. Realtime delivery is not claimed without dedicated socket infra.

### Media Processing & Upload Boundary
- **Implemented & Authoritative:**
  - Secure signed upload parameter generation (`generateUploadSignature`, `generateListingUploadSignature`) preventing exposure of Cloudinary API secrets.
  - Direct buffer upload fallback for mobile/web clients.
  - Strict upload limits: 10 MB for images, 100 MB for video files.
  - MIME-type whitelisting (`image/*`, `video/*`).
  - Missing media fallback URL helpers (`getSignedDeliveryUrl`, `getListingMediaDeliveryUrl`).
  - Raw-body webhook signature verification for Cloudinary processing events.
- **Deferred Processing:**
  - Dedicated video transcoding worker fleets, FFmpeg chunking, and multi-bitrate HLS packaging are deferred as per architectural contract. Direct MP4 delivery via Cloudinary CDN is used.

### Notification Delivery Boundary
- **Implemented & Authoritative:**
  - In-app notification persistence (`Notification` table) for chat messages, listing approvals/rejections, and reel engagement.
  - Notification preference controls per user (`NotificationPreference`).
  - Mark as read, mark all read, and delete endpoints.
- **Deferred Delivery:**
  - External push notifications (APNs / FCM), outbound transactional emails (beyond registration OTPs), and SMS delivery are deferred. In-app notification badges represent authoritative status; external push is never claimed without provider integration.

---

## 7. Performance & Abuse Protection

### Bounded Pagination Contracts
All listing and feed queries strictly enforce upper pagination bounds:
- Marketplace listings: Default 20, max 50 items.
- Reels feed: Default 10, max 30 items.
- Conversation list: Default 20, max 100 items.
- Message history: Default 30, max 100 items.
- Notification history: Default 20, max 50 items.

### Abuse Mitigation
- **Auth Rate Limiter:** 30 attempts per 15 minutes per IP (`authLimiter`) on login, register, and OTP endpoints.
- **API Rate Limiter:** 300 requests per 15 minutes per IP (`apiLimiter`) on standard endpoints.
- **Atomic Balance & Idempotency:** Coin debits and boost creations require an `idempotencyKey` and utilize PostgreSQL database row-locks (`SELECT ... FOR UPDATE`) to prevent double-spending or race condition replays.
