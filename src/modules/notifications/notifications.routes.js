import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './notifications.controller.js';
import { notificationIdParamSchema, notificationsQuerySchema, updatePreferencesSchema } from './notifications.validation.js';

const router = Router();
router.use(authenticate);
router.get('/', validate({ query: notificationsQuerySchema }), controller.list);
router.patch('/read-all', controller.markAllRead);
router.get('/preferences', controller.getPreferences);
router.patch('/preferences', validate({ body: updatePreferencesSchema }), controller.updatePreferences);
router.patch('/:notificationId/read', validate({ params: notificationIdParamSchema }), controller.markRead);
router.delete('/:notificationId', validate({ params: notificationIdParamSchema }), controller.remove);
export default router;
