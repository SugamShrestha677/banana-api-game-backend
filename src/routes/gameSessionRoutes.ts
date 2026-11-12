import { Router } from 'express';
import { GameSessionController } from '../controllers/GameSessionController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.post('/start', GameSessionController.start);
router.post('/:id/answer', GameSessionController.submitAnswer);
router.post('/:id/end', GameSessionController.end);

export default router;