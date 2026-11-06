import { Router } from 'express';
import { LeaderboardController } from '../controllers/LeaderboardController';
import { optionalAuth } from '../middleware/optionalAuth';

const router = Router();

router.get('/', optionalAuth, LeaderboardController.get);

export default router;