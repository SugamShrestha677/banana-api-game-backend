// backend/src/routes/puzzleRoutes.ts
import { Router } from 'express';
import {PuzzleController} from '../../src/controllers/PuzzleController';
const router = Router();
router.get('/new', PuzzleController.getNew);
router.post('/:id/answer', PuzzleController.submitAnswer);
export default router;