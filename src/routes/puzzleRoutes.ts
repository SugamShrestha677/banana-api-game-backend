// backend/src/routes/puzzleRoutes.ts
import { Router } from 'express';
import { PuzzleService } from '../services/PuzzleService';

const router = Router();
router.get('/new', async (req, res) => {
  try {
    const puzzle = await PuzzleService.getNewPuzzle();
    // IMPORTANT: Do not send the solution!
    res.json({ id: puzzle.id, imageUrl: puzzle.imageUrl });
  } catch (error) { res.status(500).json({ error: 'Could not fetch puzzle' }); }
});
export default router;