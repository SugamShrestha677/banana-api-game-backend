import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { requireAuth } from '../middleware/authMiddleware';
import { AvatarController } from '../controllers/AvatarController';
import multer from 'multer';

// Configure multer for in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB limit
});

const router = Router();

router.use(requireAuth);   // all user routes require auth

router.get('/me', UserController.me);
router.get('/me/stats', UserController.stats);   
router.get('/me/high-scores', UserController.highScores);
router.post('/high-score', UserController.updateHighScore);
router.post('/avatar', upload.single('avatar'), AvatarController.upload);

export default router;
