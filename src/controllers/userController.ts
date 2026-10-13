import { Request, Response } from 'express';
import { UserService } from '../services/userService';

export class UserController {
  // GET /api/users/me
  static async me(req: Request, res: Response) {
    try {
      const user = await UserService.getProfile(req.userId!);
      res.json(user);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  }

  // POST /api/users/high-score
  static async updateHighScore(req: Request, res: Response) {
    try {
      const { score } = req.body;

      if (typeof score !== 'number') {
        return res.status(400).json({ error: 'score must be a number' });
      }

      const result = await UserService.submitScore(req.userId!, score);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
}
