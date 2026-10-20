import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes.js';
import categoriesRouter from '../modules/categories/categories.routes.js';
import usersRouter from '../modules/users/users.routes.js';
import reelsRouter from '../modules/reels/reels.routes.js';
import listingsRouter from '../modules/listings/listings.routes.js';
import wishlistRouter from '../modules/wishlist/wishlist.routes.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// ── Auth Module ───────────────────────────────────────────────
router.use('/auth', authRouter);

// ── Categories Module ─────────────────────────────────────────
router.use('/categories', categoriesRouter);

// ── Users Module ──────────────────────────────────────────────
router.use('/users', usersRouter);

// ── Marketplace Module ───────────────────────────────────────
router.use('/listings', listingsRouter);
router.use('/wishlist', wishlistRouter);

// ── Reels Module ──────────────────────────────────────────────
// authenticate validates Bearer tokens and attaches req.user / req.creatorId.
// In development, falls back safely to DEV_TEST_CREATOR_ID if configured.
router.use('/reels', authenticate, reelsRouter);

export default router;
