import { Router } from 'express';
import { AchievementController } from '../controllers/AchievementController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.get('/', AchievementController.getAchievements);

export default router;
