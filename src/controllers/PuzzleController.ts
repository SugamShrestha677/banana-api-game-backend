import { Request, Response } from 'express';
import { PuzzleService } from '../services/PuzzleService';

export class PuzzleController {
  // GET /api/puzzles/new
  static async getNew(req: Request, res: Response) {
    try {
      const puzzle = await PuzzleService.getNewPuzzle();
      res.json(puzzle);
    } catch (error) {
      console.error('Puzzle fetch error:', error);
      res.status(502).json({ error: 'Could not fetch a puzzle. Try again.' });
    }
  }

  // POST /api/puzzles/:id/answer
  static async submitAnswer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { answer } = req.body;

      if (answer === undefined || answer === null || answer === '') {
        return res.status(400).json({ error: 'Answer is required' });
      }

      const result = await PuzzleService.validateAnswer(id, String(answer));
      res.json(result);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === 'Puzzle not found' ? 404 : 500).json({ error: message });
    }
  }
}
