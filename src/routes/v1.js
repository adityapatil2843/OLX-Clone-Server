import { Router } from 'express';
import categoriesRouter from '../modules/categories/categories.routes.js';
import usersRouter from '../modules/users/users.routes.js';
import reelsRouter from '../modules/reels/reels.routes.js';
import { devCreatorIdentity } from '../middlewares/devCreatorIdentity.js';

const router = Router();

// ── Categories Module ─────────────────────────────────────────
router.use('/categories', categoriesRouter);

// ── Users Module ──────────────────────────────────────────────
router.use('/users', usersRouter);

// ── Reels Module ──────────────────────────────────────────────
// devCreatorIdentity supplies a test ID in development for reels write endpoints.
// Real auth middleware will replace this when authentication is implemented.
router.use('/reels', devCreatorIdentity, reelsRouter);

export default router;
