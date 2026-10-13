import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);   // all user routes require auth

router.get('/me', UserController.me);
router.post('/high-score', UserController.updateHighScore);

export default router;
