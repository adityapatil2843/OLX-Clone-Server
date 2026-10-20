import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes.js';
import categoriesRouter from '../modules/categories/categories.routes.js';
import usersRouter from '../modules/users/users.routes.js';
import reelsRouter from '../modules/reels/reels.routes.js';
import listingsRouter from '../modules/listings/listings.routes.js';
import wishlistRouter from '../modules/wishlist/wishlist.routes.js';
import advertisementsRouter from '../modules/advertisements/advertisements.routes.js';
import chatRouter from '../modules/chat/chat.routes.js';
import adminRouter from '../modules/admin/admin.routes.js';
import reportsRouter from '../modules/admin/reports.routes.js';

const router = Router();

// ── Authentication & Profiles ─────────────────────────────────
router.use('/auth', authRouter);
router.use('/users', usersRouter);

// ── Categories & Taxonomy ─────────────────────────────────────
router.use('/categories', categoriesRouter);

// ── Classified Marketplace & Saved Items ──────────────────────
router.use('/listings', listingsRouter);
router.use('/wishlist', wishlistRouter);

// ── Short-Form Video Reels & Discovery ─────────────────────────
router.use('/reels', reelsRouter);

// ── Commercial Campaigns & Advertisements ─────────────────────
router.use('/advertisements', advertisementsRouter);

// ── Buyer-Seller Chat & Messaging ─────────────────────────────
router.use('/conversations', chatRouter);

// ── Moderation, Complaints & Admin ────────────────────────────
router.use('/reports', reportsRouter);
router.use('/admin', adminRouter);

export default router;
