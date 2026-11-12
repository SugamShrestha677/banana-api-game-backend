import { Request, Response } from 'express';
import { GameSessionService } from '../services/GameSessionService';

export class GameSessionController {
  static async start(req: Request, res: Response) {
    try {
      const { difficulty } = req.body;
      if (!['easy', 'medium', 'hard'].includes(difficulty)) {
        return res.status(400).json({ error: 'Difficulty must be easy, medium, or hard' });
      }
      const result = await GameSessionService.startGame(req.userId!, difficulty);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  static async submitAnswer(req: Request, res: Response) {
    try {
      const { id } = req.params;   // gameId
      const { puzzleId, answer } = req.body;
      if (!puzzleId) return res.status(400).json({ error: 'puzzleId is required' });

      const result = await GameSessionService.submitAnswer(
        req.userId!,
        id,
        puzzleId,
        String(answer ?? '')
      );
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  static async end(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await GameSessionService.endGame(req.userId!, id);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
}