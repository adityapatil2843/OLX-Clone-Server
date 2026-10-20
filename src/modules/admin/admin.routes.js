import { Router } from 'express';
import * as controller from './admin.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRole } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import {
  idParamSchema,
  moderateListingSchema,
  moderateReelSchema,
  moderateUserSchema,
  resolveReportSchema,
  paginationQuerySchema,
} from './admin.validation.js';

const router = Router();

// All admin routes require authentication and staff roles
router.use(authenticate);
router.use(requireRole(['ADMIN', 'MODERATOR']));

// ── Metrics ───────────────────────────────────────────────────

router.get('/metrics', controller.getMetrics);

// ── Moderation ────────────────────────────────────────────────

router.patch(
  '/listings/:id/moderate',
  validate({ params: idParamSchema, body: moderateListingSchema }),
  controller.moderateListing
);

router.patch(
  '/reels/:id/moderate',
  validate({ params: idParamSchema, body: moderateReelSchema }),
  controller.moderateReel
);

router.patch(
  '/users/:id/moderate',
  requireRole(['ADMIN']), // User role changes restricted to ADMIN
  validate({ params: idParamSchema, body: moderateUserSchema }),
  controller.moderateUser
);

// ── Reports ───────────────────────────────────────────────────

router.get(
  '/reports',
  validate({ query: paginationQuerySchema }),
  controller.listReports
);

router.patch(
  '/reports/:id',
  validate({ params: idParamSchema, body: resolveReportSchema }),
  controller.resolveReport
);

// ── Audit Logs ────────────────────────────────────────────────

router.get(
  '/audit-logs',
  requireRole(['ADMIN']),
  validate({ query: paginationQuerySchema }),
  controller.listAuditLogs
);

export default router;
